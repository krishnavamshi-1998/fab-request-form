import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET() {
  try {
    // 1. Authenticate with your existing Google Cloud Identity Card
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        // Replace literal \n markers back into standard formatting blocks
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // 2. Parallel execution to fetch the 3 custom data locations cleanly
    const [toolsRes, machinesRes, stockRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Tools!B3:B', // Your Tool column
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Machines!J3:J', // Your Machine column
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Master Stock!R3:R', // Your Supervisor column location
      }),
    ]);

    // 3. Extract strings & clean up any blank/empty rows in between data
    const tools = toolsRes.data.values
      ? toolsRes.data.values.flat().filter((item) => item && item.trim() !== '')
      : [];

    const machines = machinesRes.data.values
      ? machinesRes.data.values.flat().filter((item) => item && item.trim() !== '')
      : [];

    const supervisors = stockRes.data.values
      ? stockRes.data.values.flat().filter((item) => item && item.trim() !== '')
      : [];

    // 4. Send the cleaned arrays directly to your UI dropdown components
    return NextResponse.json({
      success: true,
      data: {
        tools,
        machines,
        supervisors,
      },
    });

  } catch (error: any) {
    console.error('Google Sheets Data Extraction Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch dropdown data' },
      { status: 500 }
    );
  }
}