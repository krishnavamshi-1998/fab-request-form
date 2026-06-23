import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { supervisor, location, expectedReturn, department, items } = body;

    // 1. Quick payload verification guard
    if (!supervisor || !items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing required request form elements' },
        { status: 400 }
      );
    }

    // 2. Initialize Google Auth with Read/Write access scope
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // 3. Format the data grid arrays to push down into rows
    // Change 'Fabrication Logs' to match the exact name of your main logging sheet tab
    const targetSheetTab = 'Fabrication Logs'; 
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const rowsToAppend = items.map((item: any) => [
      timestamp,          // Column A: Date & Time
      supervisor,         // Column B: Supervisor Name
      location,           // Column C: Location / Site
      department,         // Column D: Department Allocation
      expectedReturn,     // Column E: Expected Return Date
      item.type,          // Column F: Category (Tools or Machine)
      item.itemName,      // Column G: Item Model Name
      item.quantity       // Column H: Dispatched Quantity
    ]);

    // 4. Append rows seamlessly to the bottom of the log file
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${targetSheetTab}!A:H`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rowsToAppend,
      },
    });

    return NextResponse.json({ success: true, message: 'Data logged successfully!' });

  } catch (error: any) {
    console.error('Google Sheets Submission Failure:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal transmission failure' },
      { status: 500 }
    );
  }
}