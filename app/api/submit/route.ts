import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(request: Request) {
  try {
    const body = await request.json();
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
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
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

    const toolRows: any[][] = [];
    const machineRows: any[][] = [];

    // 5. STRICT 8-COLUMN DATA ROUTING MATRIX
    items.forEach((item: any) => {
      const actualItemName = item.itemName || item.name || 'Unknown Item';
      
      // Force construct exactly 8 array items. 
      // There is NO "item.type" or "Category" inside this array.
      const rowData = [
        '=ROW()-1',                       // Col A: S. No
        timestamp,                        // Col B: Timestamp
        String(supervisor).trim(),        // Col C: Supervisor Name
        String(location).trim(),          // Col D: Location
        String(issuedTo).trim(),          // Col E: Issued To
        String(actualItemName).trim(),    // Col F: Tool/Machine Name
        Number(item.quantity) || 1,       // Col G: Quantity
        String(expectedReturn).trim()     // Col H: Expected Return Date
      ];

      // Use the item type strictly to choose the target sheet, NOT to write to a column
      if (String(item.type).toLowerCase().includes('machine')) {
        machineRows.push(rowData);
      } else {
        // Defaults to Tools sheet if it's not a machine
        toolRows.push(rowData);
      }
    });

    // 6. Fire parallel appends targeting the strict A:H range limits
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
    return NextResponse.json({ success: true, message: 'Data logged successfully!' });

  } catch (error: any) {
    console.error('Google Sheets Submission Failure:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal transmission failure' },
      { status: 500 }
    );
  }
}