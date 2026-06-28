import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { supervisor, supervisorMobile, location, expectedReturn, issuedTo, items, formClass } = body;

    if (!supervisor || !items || items.length === 0) {
      return NextResponse.json({ success: false, error: 'Missing information.' }, { status: 400 });
    }

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!privateKey || !email || !spreadsheetId) throw new Error('Missing keys.');
    privateKey = privateKey.startsWith('"') && privateKey.endsWith('"') ? privateKey.slice(1, -1) : privateKey;
    privateKey = privateKey.replace(/\\n/g, '\n');

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now);
    const timestamp = `${parts.find(p=>p.type==='day')?.value}/${parts.find(p=>p.type==='month')?.value}/${parts.find(p=>p.type==='year')?.value} ${parts.find(p=>p.type==='hour')?.value}:${parts.find(p=>p.type==='minute')?.value}:${parts.find(p=>p.type==='second')?.value}`;

    async function appendToSheetDynamic(sheetName: string, targetItems: any[]) {
      if (targetItems.length === 0) return;

      const headerResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!1:1` });
      const headers = headerResponse.data.values?.[0] || [];
      const cleanHeaders = headers.map(h => String(h).trim().toLowerCase().replace(/\s+/g, ' '));

      const idxSNo = cleanHeaders.findIndex(h => h.includes('s. no') || h.includes('s.no') || h === 'sl');
      const idxTimestamp = cleanHeaders.indexOf('timestamp');
      const idxSupervisor = cleanHeaders.findIndex(h => h.includes('supervisor name') || h === 'supervisor');
      const idxMobile = cleanHeaders.findIndex(h => h.includes('mobile') || h.includes('phone') || h.includes('contact'));
      const idxLocation = cleanHeaders.indexOf('location');
      const idxIssuedTo = cleanHeaders.findIndex(h => h.includes('issued to'));
      const idxItemName = cleanHeaders.findIndex(h => h.includes('name') && (h.includes('tool') || h.includes('machine') || h.includes('item')));
      const idxQuantity = cleanHeaders.indexOf('quantity');
      const idxReturn = cleanHeaders.findIndex(h => h.includes('return'));

      const rowsToAppend = targetItems.map((item: any) => {
        const maxIndex = Math.max(idxSNo, idxTimestamp, idxSupervisor, idxMobile, idxLocation, idxIssuedTo, idxItemName, idxQuantity, idxReturn);
        const rowData = new Array(maxIndex + 1).fill('');

        if (idxSNo !== -1) rowData[idxSNo] = '=ROW()-1';
        if (idxTimestamp !== -1) rowData[idxTimestamp] = timestamp;
        if (idxSupervisor !== -1) rowData[idxSupervisor] = String(supervisor).trim();
        if (idxMobile !== -1) rowData[idxMobile] = String(supervisorMobile || '').trim();
        if (idxLocation !== -1) rowData[idxLocation] = String(location).trim();
        if (idxIssuedTo !== -1) rowData[idxIssuedTo] = String(issuedTo).trim();
        if (idxItemName !== -1) rowData[idxItemName] = String(item.itemName || 'Unknown').trim();
        if (idxQuantity !== -1) rowData[idxQuantity] = Number(item.quantity) || 1;
        
        // 💡 FIXED: Always append return date across all forms if provided
        if (idxReturn !== -1) {
          rowData[idxReturn] = String(expectedReturn || '').trim();
        }

        return rowData;
      });

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rowsToAppend },
      });
    }

    if (formClass === 'consumable') {
      await appendToSheetDynamic('Consumables', items);
    } else {
      const toolItems = items.filter((item: any) => !String(item.type).toLowerCase().includes('machine'));
      const machineItems = items.filter((item: any) => String(item.type).toLowerCase().includes('machine'));
      await Promise.all([appendToSheetDynamic('Tools', toolItems), appendToSheetDynamic('Machines', machineItems)]);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}