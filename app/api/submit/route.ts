import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Destructuring fields to match the updated form payload
    const { supervisor, location, expectedReturn, issuedTo, items } = body;

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
      credentials: {
        client_email: email,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // 4. Precise Timestamp Generation (DD/MMM/YYYY HH:mm:ss, No Comma)
    const now = new Date();
    const formattedParts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',   // Forces 3-letter month formatting (e.g., Jan, Feb, Jun)
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false     // Enforces strict 24-hour clock layout
    }).formatToParts(now);

    const day = formattedParts.find(p => p.type === 'day')?.value;
    const month = formattedParts.find(p => p.type === 'month')?.value;
    const year = formattedParts.find(p => p.type === 'year')?.value;
    let hour = formattedParts.find(p => p.type === 'hour')?.value;
    const minute = formattedParts.find(p => p.type === 'minute')?.value;
    const second = formattedParts.find(p => p.type === 'second')?.value;

    if (hour === '24') {
      hour = '00';
    }

    const timestamp = `${day}/${month}/${year} ${hour}:${minute}:${second}`;

    // 5. Separate items into Tools and Machines buckets matching your strict column order
    const toolRows: any[][] = [];
    const machineRows: any[][] = [];

    items.forEach((item: any) => {
      // Fail-safe property extraction to prevent frontend property mixups
      const actualItemName = item.itemName || item.name || item.toolName || item.machineName || 'Unknown Item';
      const actualReturnDate = expectedReturn || item.expectedReturn || 'N/A';

      // STRICT COLUMN ORDER MAPPING MATRIX (A to H)
      const rowData = [
        '=ROW()-1',           // Column A: S. No
        timestamp,            // Column B: Timestamp
        supervisor || 'N/A',  // Column C: Supervisor Name
        location || 'N/A',    // Column D: Location
        issuedTo || 'N/A',    // Column E: Issued To
        String(actualItemName).trim(),   // Column F: Tool/Machine Name (GUARANTEED)
        Number(item.quantity) || 1,      // Column G: Quantity
        String(actualReturnDate).trim()  // Column H: Expected Return Date (GUARANTEED)
      ];

      // Route the cleanly constructed row arrays to the proper sheet targets
      if (item.type === 'Tools') {
        toolRows.push(rowData);
      } else if (item.type === 'Machine') {
        machineRows.push(rowData);
      }
    });

    // 6. Fire parallel appends targeting the strict A:H limits
    const appendPromises = [];

    if (toolRows.length > 0) {
      appendPromises.push(
        sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Tools!A:H', 
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: toolRows },
        })
      );
    }

    if (machineRows.length > 0) {
      appendPromises.push(
        sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Machines!A:H', 
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: machineRows },
        })
      );
    }

    await Promise.all(appendPromises);

    return NextResponse.json({ success: true, message: 'Data successfully logged with corrected column swaps!' });

  } catch (error: any) {
    console.error('Google Sheets Submission Failure:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal transmission failure' },
      { status: 500 }
    );
  }
}