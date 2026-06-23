import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: [
        'Master Stock!B3:B', 
        'Master Stock!J3:J', 
        'Master Stock!R3:R', 
      ],
    });

    const valueRanges = response.data.valueRanges || [];

    const toolsRaw = valueRanges[0] && valueRanges[0].values ? valueRanges[0].values : [];
    const machinesRaw = valueRanges[1] && valueRanges[1].values ? valueRanges[1].values : [];
    const supervisorsRaw = valueRanges[2] && valueRanges[2].values ? valueRanges[2].values : [];

    const tools = toolsRaw
      .flat()
      .filter((item) => item && item.trim() !== '')
      .map((item) => ({ name: item, stock: 'Available' }));

    const machines = machinesRaw
      .flat()
      .filter((item) => item && item.trim() !== '')
      .map((item) => ({ name: item, stock: 'Available' }));

    const supervisors = supervisorsRaw
      .flat()
      .filter((item) => item && item.trim() !== '') as string[];

    return NextResponse.json({
      success: true,
      supervisors,
      tools,
      machines,
    });

  } catch (error: any) {
    console.error('--- GOOGLE SHEET ERROR DETAILS ---');
    console.error(error.response?.data || error.message || error);
    console.error('----------------------------------');
    
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch tracking dropdown entries' },
      { status: 500 }
    );
  }
}