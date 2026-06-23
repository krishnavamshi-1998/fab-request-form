import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
    // Clean up Netlify string wrapping issues seamlessly
    const cleanKey = rawKey.replace(/\\n/g, '\n').replace(/^"(.*)"$/, '$1');

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL || '',
      key: cleanKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || process.env.GOOGLE_SHEET_ID || '';

    if (!spreadsheetId) {
      throw new Error('Spreadsheet ID missing from environment variables.');
    }

    // Fetching the exact columns matching your layout from 'Master Stock' starting at row 3
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: [
        "'Master Stock'!B3:B", // Tools column
        "'Master Stock'!J3:J", // Machines column
        "'Master Stock'!R3:R"  // Supervisors column
      ], 
    });

    const valueRanges = response.data.valueRanges || [];
    
    // 1. Process Tools Collection (from column B)
    const rawTools = valueRanges[0]?.values || [];
    const toolsCollection = rawTools
      .map(row => row[0])
      .filter(Boolean)
      .map(name => ({ name, stock: 'Available' })); // Standard fallback stock flag

    // 2. Process Machines Collection (from column J)
    const rawMachines = valueRanges[1]?.values || [];
    const machinesCollection = rawMachines
      .map(row => row[0])
      .filter(Boolean)
      .map(name => ({ name, stock: 'Available' }));

    // 3. Process Supervisors List (from column R)
    const rawSupervisors = valueRanges[2]?.values || [];
    const supervisorsList = rawSupervisors
      .map(row => row[0])
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      supervisors: supervisorsList,
      tools: toolsCollection,
      machines: machinesCollection
    });
  } catch (error: any) {
    console.error('Dropdown asset compilation failure:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}