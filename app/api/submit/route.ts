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

    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // 3. Separate items into Tools and Machines buckets with S. No in Column A
    const toolRows: any[][] = [];
    const machineRows: any[][] = [];

    items.forEach((item: any) => {
      const rowData = [
        '=ROW()-1',         // Column A: Dynamic Serial Number (Auto-counts rows)
        timestamp,          // Column B: Date & Time
        supervisor,         // Column C: Supervisor Name
        location,           // Column D: Location / Site
        department,         // Column E: Department Allocation
        expectedReturn,     // Column F: Expected Return Date
        item.type,          // Column G: Category (Tools or Machine)
        item.itemName,      // Column H: Item Model Name
        item.quantity       // Column I: Dispatched Quantity
      ];

      if (item.type === 'Tools') {
        toolRows.push(rowData);
      } else if (item.type === 'Machine') {
        machineRows.push(rowData);
      }
    });

    // 4. Send parallel append requests to Google Sheets (Targeting A:I columns now)
    const appendPromises = [];

    if (toolRows.length > 0) {
      appendPromises.push(
        sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Tools!A:I', 
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: toolRows },
        })
      );
    }

    if (machineRows.length > 0) {
      appendPromises.push(
        sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Machines!A:I', 
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: machineRows },
        })
      );
    }

    await Promise.all(appendPromises);

    return NextResponse.json({ success: true, message: 'Data successfully split and logged with S.No!' });

  } catch (error: any) {
    console.error('Google Sheets Submission Failure:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal transmission failure' },
      { status: 500 }
    );
  }
}