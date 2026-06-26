import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Destructuring fields including the new supervisorEmail from frontend
    const { supervisor, supervisorEmail, location, expectedReturn, issuedTo, items } = body;

    // 1. Guard rails for validation
    if (!supervisor || !items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing required request form elements' },
        { status: 400 }
      );
    }

    // 2. Extract and Sanitize Credentials
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!privateKey || !email || !spreadsheetId) {
      throw new Error('CRITICAL: Missing environment configuration keys in submission handler.');
    }

    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');

    // 3. Initialize Google Auth with Read/Write access scope
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // 4. Precise Timestamp Generation (DD/MMM/YYYY HH:mm:ss, No Comma)
    const now = new Date();
    const formattedParts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(now);

    const day = formattedParts.find(p => p.type === 'day')?.value;
    const month = formattedParts.find(p => p.type === 'month')?.value;
    const year = formattedParts.find(p => p.type === 'year')?.value;
    let hour = formattedParts.find(p => p.type === 'hour')?.value;
    const minute = formattedParts.find(p => p.type === 'minute')?.value;
    const second = formattedParts.find(p => p.type === 'second')?.value;

    if (hour === '24') hour = '00';
    const timestamp = `${day}/${month}/${year} ${hour}:${minute}:${second}`;

    // 5. Separate items by target type before writing row arrays
    const toolItems = items.filter((item: any) => !String(item.type).toLowerCase().includes('machine'));
    const machineItems = items.filter((item: any) => String(item.type).toLowerCase().includes('machine'));

    // Helper function to dynamically map headers and append data row by row
    async function appendToSheetDynamic(sheetName: string, targetItems: any[]) {
      if (targetItems.length === 0) return;

      // Fetch row 1 (Headers) to find dynamic positions
      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!1:1`,
      });

      const headers = headerResponse.data.values?.[0] || [];
      
      // Clean up headers to match accurately
      const cleanHeaders = headers.map(h => String(h).trim().toLowerCase());

      // Map key locations dynamically based on your text headers
      const idxSNo = cleanHeaders.indexOf('s. no');
      const idxTimestamp = cleanHeaders.indexOf('timestamp');
      const idxSupervisor = cleanHeaders.indexOf('supervisor name');
      const idxMail = cleanHeaders.indexOf('supervisor mail id');
      const idxLocation = cleanHeaders.indexOf('location');
      const idxIssuedTo = cleanHeaders.indexOf('issued to');
      const idxItemName = cleanHeaders.indexOf('tool/machine name');
      const idxQuantity = cleanHeaders.indexOf('quantity');
      const idxReturn = cleanHeaders.indexOf('expected return date');

      const rowsToAppend = targetItems.map((item: any) => {
        // Find the maximum length needed to accommodate all present headers
        const maxIndex = Math.max(idxSNo, idxTimestamp, idxSupervisor, idxMail, idxLocation, idxIssuedTo, idxItemName, idxQuantity, idxReturn);
        const rowData = new Array(maxIndex + 1).fill('');

        // Dynamically place elements into their matching index if found
        if (idxSNo !== -1) rowData[idxSNo] = '=ROW()-1';
        if (idxTimestamp !== -1) rowData[idxTimestamp] = timestamp;
        if (idxSupervisor !== -1) rowData[idxSupervisor] = String(supervisor).trim();
        if (idxMail !== -1) rowData[idxMail] = String(supervisorEmail || '').trim();
        if (idxLocation !== -1) rowData[idxLocation] = String(location).trim();
        if (idxIssuedTo !== -1) rowData[idxIssuedTo] = String(issuedTo).trim();
        if (idxItemName !== -1) rowData[idxItemName] = String(item.itemName || item.name || 'Unknown').trim();
        if (idxQuantity !== -1) rowData[idxQuantity] = Number(item.quantity) || 1;
        if (idxReturn !== -1) rowData[idxReturn] = String(expectedReturn).trim();

        return rowData;
      });

      // Append data targeting the entire header width row block dynamically
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rowsToAppend },
      });
    }

    // 6. Run dynamic operations in parallel
    await Promise.all([
      appendToSheetDynamic('Tools', toolItems),
      appendToSheetDynamic('Machines', machineItems)
    ]);

    return NextResponse.json({ success: true, message: 'Data logged cleanly with dynamic header mapping!' });

  } catch (error: any) {
    console.error('Google Sheets Dynamic Submission Failure:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal submission exception' },
      { status: 500 }
    );
  }
}