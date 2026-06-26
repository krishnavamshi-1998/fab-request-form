import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// Helper function to convert a 0-based column index to a Google Sheets column letter (e.g., 0 -> A, 25 -> Z, 26 -> AA)
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

    if (!privateKey || !email || !spreadsheetId) {
      throw new Error('Missing Google Sheets environment configuration variables.');
    }

    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    // Target sheet name where your master lists live
    const sheetName = 'Master Stock';

    // 1. Fetch Row 2 to find exact matching headers
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!2:2`,
    });

    const headers = headerResponse.data.values?.[0] || [];
    
    // Find index of exact headers (case-insensitive and trimmed)
    const idxTools = headers.findIndex(h => String(h).trim().toLowerCase() === 'tools text');
    const idxMachines = headers.findIndex(h => String(h).trim().toLowerCase() === 'machines name');
    const idxSupervisors = headers.findIndex(h => String(h).trim().toLowerCase() === 'supervisor name');

    // Setup fallbacks if headers aren't found (default back to old B, J, R -> index 1, 9, 17)
    const toolsCol = idxTools !== -1 ? getColumnLetter(idxTools) : 'B';
    const machinesCol = idxMachines !== -1 ? getColumnLetter(idxMachines) : 'J';
    const supervisorsCol = idxSupervisors !== -1 ? getColumnLetter(idxSupervisors) : 'R';

    console.log(`[Dropdown Sync] Headers mapped -> Tools: Col ${toolsCol}, Machines: Col ${machinesCol}, Supervisors: Col ${supervisorsCol}`);

    // 2. Fetch data blocks in parallel starting from Row 3 (just underneath the headers)
    const [toolsRes, machinesRes, supervisorsRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!${toolsCol}3:${toolsCol}` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!${machinesCol}3:${machinesCol}` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!${supervisorsCol}3:${supervisorsCol}` }),
    ]);

    // 3. Clean up data arrays, removing empty rows
    const toolsRaw = toolsRes.data.values?.flat() || [];
    const machinesRaw = machinesRes.data.values?.flat() || [];
    const supervisorsRaw = supervisorsRes.data.values?.flat() || [];

    const cleanTools = toolsRaw.map(t => String(t).trim()).filter(t => t !== '');
    const cleanMachines = machinesRaw.map(m => String(m).trim()).filter(m => m !== '');
    const cleanSupervisors = supervisorsRaw.map(s => String(s).trim()).filter(s => s !== '');

    return NextResponse.json({
      success: true,
      tools: cleanTools,
      machines: cleanMachines,
      supervisors: cleanSupervisors
    });

  } catch (error: any) {
    console.error('Failed to dynamically fetch inventory dropdown options:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Dropdown processing error' },
      { status: 500 }
    );
  }
}