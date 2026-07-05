import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { supervisor, location, expectedReturn, issuedTo, items, formClass } = body;

    if (!supervisor || !items || items.length === 0) {
      return NextResponse.json({ success: false, error: 'Missing information.' }, { status: 400 });
    }

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!privateKey || !email || !spreadsheetId) throw new Error('Missing keys.');
    privateKey = privateKey.startsWith('"') && privateKey.endsWith('"') ? privateKey.slice(1, -1) : privateKey;
    privateKey = privateKey.replace(/\\n/g, '\n');

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // ==========================================================
    // 🔍 DYNAMIC LOOKUP: FETCH CONTACT FROM MASTER STOCK SHEET
    // ==========================================================
    // ==========================================================
    // 🔍 DYNAMIC LOOKUP: FETCH CONTACT FROM MASTER STOCK SHEET (ROW 2 HEADERS)
    // ==========================================================
    let supervisorMobile = '';
    try {
      const masterStockResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'Master Stock'!1:500`, 
      });
      const masterRows = masterStockResponse.data.values || [];
      
      // 🎯 CHANGED: Look at row 2 (index 1) for headers because row 1 is empty or a title
      if (masterRows.length > 1) {
        const masterHeaders = masterRows[1].map(h => String(h).trim().toLowerCase());
        const supNameIdx = masterHeaders.findIndex(h => h.includes('supervisor name') || h === 'supervisor');
        const supContactIdx = masterHeaders.findIndex(h => h.includes('supervisor contact') || h.includes('contact'));

        if (supNameIdx !== -1 && supContactIdx !== -1) {
          // 🎯 CHANGED: Slice from index 2 (row 3) downwards to read the actual data rows
          const matchedRow = masterRows.slice(2).find(row => {
            const cellValue = row[supNameIdx] ? String(row[supNameIdx]).trim().toLowerCase() : '';
            const searchValues = String(supervisor).trim().toLowerCase();
            return cellValue === searchValues;
          });
          
          if (matchedRow && matchedRow[supContactIdx]) {
            supervisorMobile = String(matchedRow[supContactIdx]).trim();
          }
        }
      }
    } catch (lookupError) {
      console.error("Failed to fetch contact from Master Stock sheet lookup system:", lookupError);
    }
    // ==========================================================
    // ==========================================================

    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-IN', { 
      timeZone: 'Asia/Kolkata', 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit', 
      hour12: false 
    }).formatToParts(now);

    const d = parts.find(p => p.type === 'day')?.value || '01';
    const m = parts.find(p => p.type === 'month')?.value || 'Jan';
    const y = parts.find(p => p.type === 'year')?.value || '2026';
    const hr = parts.find(p => p.type === 'hour')?.value || '00';
    const min = parts.find(p => p.type === 'minute')?.value || '00';
    const sec = parts.find(p => p.type === 'second')?.value || '00';

    const timestamp = `${d}/${m}/${y} ${hr}:${min}:${sec}`;

    async function appendToSheetDynamic(sheetName: string, targetItems: any[]) {
      if (targetItems.length === 0) return;

      const headerResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!1:1` });
      const headers = headerResponse.data.values?.[0] || [];
      const cleanHeaders = headers.map(h => String(h).trim().toLowerCase().replace(/\s+/g, ' '));

      const idxSNo = cleanHeaders.findIndex(h => h.includes('s. no') || h.includes('s.no') || h === 'sl');
      const idxTimestamp = cleanHeaders.indexOf('timestamp');
      const idxSupervisor = cleanHeaders.findIndex(h => h.includes('supervisor name') || h === 'supervisor');
      const idxMobile = cleanHeaders.findIndex(h => h.includes('mobile') || h.includes('phone') || h.includes('contact'));
      const idxLocation = cleanHeaders.indexOf('location');
      const idxIssuedTo = cleanHeaders.findIndex(h => h.includes('issued to'));
      const idxItemName = cleanHeaders.findIndex(h => h.includes('name') && (h.includes('tool') || h.includes('machine') || h.includes('item')));
      const idxQuantity = cleanHeaders.indexOf('quantity');
      const idxReturn = cleanHeaders.findIndex(h => h.includes('return'));

      const rowsToAppend = targetItems.map((item: any) => {
        const maxIndex = Math.max(idxSNo, idxTimestamp, idxSupervisor, idxMobile, idxLocation, idxIssuedTo, idxItemName, idxQuantity, idxReturn);
        const rowData = new Array(maxIndex + 1).fill('');

        if (idxSNo !== -1) rowData[idxSNo] = '=ROW()-1';
        if (idxTimestamp !== -1) rowData[idxTimestamp] = timestamp;
        if (idxSupervisor !== -1) rowData[idxSupervisor] = String(supervisor).trim();
        if (idxMobile !== -1) rowData[idxMobile] = supervisorMobile; // Populated from Master Stock mapping
        if (idxLocation !== -1) rowData[idxLocation] = String(location).trim();
        if (idxIssuedTo !== -1) rowData[idxIssuedTo] = String(issuedTo).trim();
        if (idxItemName !== -1) rowData[idxItemName] = String(item.itemName || 'Unknown').trim();
        if (idxQuantity !== -1) rowData[idxQuantity] = Number(item.quantity) || 1;
        
        if (idxReturn !== -1) {
          rowData[idxReturn] = String(expectedReturn || '').trim();
        }

        return rowData;
      });

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rowsToAppend },
      });
    }

    if (formClass === 'consumable') {
      await appendToSheetDynamic('Consumables', items);
    } else {
      const toolItems = items.filter((item: any) => !String(item.type).toLowerCase().includes('machine'));
      const machineItems = items.filter((item: any) => String(item.type).toLowerCase().includes('machine'));
      await Promise.all([appendToSheetDynamic('Tools', toolItems), appendToSheetDynamic('Machines', machineItems)]);
    }

    // ==========================================
    // 📧 EMAIL DISPATCHER 
    // ==========================================
    try {
      const managerEmail = "krishna.vamshi@sadhguru.org"; 
      const senderEmail = process.env.ALERT_EMAIL_USER;       
      const senderPass = process.env.ALERT_EMAIL_PASS;       

      if (senderEmail && senderPass && managerEmail) {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: senderEmail, pass: senderPass }
        });

        const formTypeName = formClass === 'consumable' ? 'Consumables' : 'Returnables';
        const itemRowsHtml = (items || []).map((i: any) => `<li><strong>[${i.type || formTypeName}]</strong> ${i.itemName || ''} — Qty: ${i.quantity || 1}</li>`).join('');

        const mailOptions = {
          from: `"Material Portal Alert" <${senderEmail}>`,
          to: managerEmail,
          subject: `⚠️ New ${formTypeName} Request Submitted - ${supervisor}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #eee; border-radius: 8px;">
              <h2 style="color: #1e3a8a; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-top: 0;">Material Issue Notification</h2>
              <p>A new form log has been recorded with the following details:</p>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tbody>
                  <tr><td style="padding: 6px 0; font-weight: bold; width: 150px;">Form Type:</td><td>${formTypeName}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Supervisor:</td><td>${supervisor}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Mobile Line:</td><td>${supervisorMobile || 'Fetched from Master Sheet'}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Site Location:</td><td>${location}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Issued To:</td><td>${issuedTo}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Expected Return:</td><td>${expectedReturn || 'N/A'}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Timestamp:</td><td>${timestamp}</td></tr>
                </tbody>
              </table>
              <h4 style="color: #475569; margin-bottom: 8px; margin-top: 0;">Items Requested:</h4>
              <ul style="padding-left: 20px; line-height: 1.6; margin-top: 0;">
                ${itemRowsHtml}
              </ul>
              <hr style="border: 0; border-top: 1px solid #eee; margin-top: 25px;" />
              <p style="font-size: 11px; color: #94a3b8; margin-bottom: 0;">This is an automated tracking server message.</p>
            </div>
          `
        };

        await transporter.sendMail(mailOptions);
      }
    } catch (mailError) {
      console.error("Email notification pipeline error:", mailError);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Server side failure.' }, { status: 500 });
  }
}