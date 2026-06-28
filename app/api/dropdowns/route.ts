import { NextResponse } from 'next/server';
import { google } from 'googleapis';

function getColumnLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export async function GET() {
  try {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!privateKey || !email || !spreadsheetId) throw new Error('Missing configuration.');
    privateKey = privateKey.startsWith('"') && privateKey.endsWith('"') ? privateKey.slice(1, -1) : privateKey;
    privateKey = privateKey.replace(/\\n/g, '\n');

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // --- 1. FETCH RETURNABLES DROPDOWNS (EXISTING) ---
    const returnableSheet = 'Master Stock';
    const retHeaderRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${returnableSheet}!2:2` });
    const retHeaders = retHeaderRes.data.values?.[0] || [];
    
    const idxTools = retHeaders.findIndex(h => String(h).trim().toLowerCase() === 'tools name');
    const idxMachines = retHeaders.findIndex(h => String(h).trim().toLowerCase() === 'machines name');
    const idxSupervisors = retHeaders.findIndex(h => String(h).trim().toLowerCase() === 'supervisor name');

    const toolsCol = idxTools !== -1 ? getColumnLetter(idxTools) : 'B';
    const machinesCol = idxMachines !== -1 ? getColumnLetter(idxMachines) : 'J';
    const supervisorsCol = idxSupervisors !== -1 ? getColumnLetter(idxSupervisors) : 'R';

    const [toolsRes, machinesRes, supervisorsRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${returnableSheet}!${toolsCol}3:${toolsCol}` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${returnableSheet}!${machinesCol}3:${machinesCol}` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${returnableSheet}!${supervisorsCol}3:${supervisorsCol}` }),
    ]);

    // --- 2. FETCH CONSUMABLES DROPDOWNS (NEW) ---
    const consumableSheet = 'Consumable Master Stock';
    const conHeaderRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${consumableSheet}!2:2` });
    const conHeaders = conHeaderRes.data.values?.[0] || [];

    const idxConItems = conHeaders.findIndex(h => String(h).trim().toLowerCase() === 'item name');
    const idxConSups = conHeaders.findIndex(h => String(h).trim().toLowerCase() === 'supervisor name');

    const conItemsCol = idxConItems !== -1 ? getColumnLetter(idxConItems) : 'A';
    const conSupsCol = idxConSups !== -1 ? getColumnLetter(idxConSups) : 'B';

    const [conItemsRes, conSupsRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${consumableSheet}!${conItemsCol}3:${conItemsCol}` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${consumableSheet}!${conSupsCol}3:${conSupsCol}` }),
    ]);

    return NextResponse.json({
      success: true,
      // Returnables packages
      tools: (toolsRes.data.values?.flat() || []).map(t => String(t).trim()).filter(Boolean),
      machines: (machinesRes.data.values?.flat() || []).map(m => String(m).trim()).filter(Boolean),
      supervisors: (supervisorsRes.data.values?.flat() || []).map(s => String(s).trim()).filter(Boolean),
      // Consumables packages
      consumableItems: (conItemsRes.data.values?.flat() || []).map(i => String(i).trim()).filter(Boolean),
      consumableSupervisors: (conSupsRes.data.values?.flat() || []).map(s => String(s).trim()).filter(Boolean),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}