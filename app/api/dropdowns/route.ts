import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET() {
  try {
    // 1. Authenticate with Google
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // 2. Fetch the data directly using a batch get to pull all three columns at once from 'Master Stock'
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: [
        'Master Stock!B3:B', // Column B: Tools
        'Master Stock!J3:J', // Column J: Machines
        'Master Stock!R3:R', // Column R: Supervisors
      ],
    });

    const valueRanges = response.data.valueRanges || [];

    // 3. Extract the columns safely, cleaning up blank rows
    const toolsRaw = valueRanges[0]?.values || [];
    const machinesRaw = valueRanges[1]?.values || [];
    const supervisorsRaw = valueRanges[2]?.values || [];

    // Map tools and machines into the object array structure your UI expects ({ name, stock })
    const tools = toolsRaw
      .flat()
      .filter((item) => item && item.trim() !== '')
      .map((item) => ({ name: item, stock: 'Available' }));

    const machines = machinesRaw
      .flat()
      .filter((item) => item && item.trim() !== '')
      .map((item) => ({ name: item, stock: 'Available' }));

    // Extract supervisors as a flat array of clean strings
    const supervisors = supervisorsRaw
      .flat()
      .filter((item) => item && item.trim() !== '') as string[];

    // 4. Return the clean, flat schema directly to your frontend page component
    return NextResponse.json({
      success: true,
      supervisors,
      tools,
      machines,
    });

  } catch (error: any) {
    console.error('Google Sheets Master Stock Extraction Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch tracking dropdown entries' },
      { status: 500 }
    );
  }
}