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
    const sheetName = 'Master Stock';

    // Read Row 2 for target exact texts
    const headerResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!2:2` });
    const headers = headerResponse.data.values?.[0] || [];
    
    const idxTools = headers.findIndex(h => String(h).trim().toLowerCase() === 'tools name');
    const idxMachines = headers.findIndex(h => String(h).trim().toLowerCase() === 'machines name');
    const idxSupervisors = headers.findIndex(h => String(h).trim().toLowerCase() === 'supervisor name');

    const toolsCol = idxTools !== -1 ? getColumnLetter(idxTools) : 'B';
    const machinesCol = idxMachines !== -1 ? getColumnLetter(idxMachines) : 'J';
    const supervisorsCol = idxSupervisors !== -1 ? getColumnLetter(idxSupervisors) : 'R';

    const [toolsRes, machinesRes, supervisorsRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!${toolsCol}3:${toolsCol}` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!${machinesCol}3:${machinesCol}` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!${supervisorsCol}3:${supervisorsCol}` }),
    ]);

    return NextResponse.json({
      success: true,
      tools: (toolsRes.data.values?.flat() || []).map(t => String(t).trim()).filter(Boolean),
      machines: (machinesRes.data.values?.flat() || []).map(m => String(m).trim()).filter(Boolean),
      supervisors: (supervisorsRes.data.values?.flat() || []).map(s => String(s).trim()).filter(Boolean)
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}