require("@next/env").loadEnvConfig(process.cwd());
const { google } = require("googleapis");

(async () => {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const sheetId = process.env.GOOGLE_SHEETS_FINANCE_ID;

  console.log("Email:", email);
  console.log("Key length:", key?.length || "MISSING");
  console.log("Key starts with:", key?.substring(0, 30));
  console.log("Key contains newlines:", key?.includes("\n"));
  console.log("Sheet ID:", sheetId);
  console.log("---");

  if (!email || !key || !sheetId) {
    console.log("Missing env vars — abort");
    return;
  }

  const normalisedKey = key.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email,
    key: normalisedKey,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ],
  });

  try {
    await auth.authorize();
    console.log("[1/2] Auth: OK");
  } catch (e) {
    console.log("[1/2] Auth: FAILED -", e.message);
    return;
  }

  const drive = google.drive({ version: "v3", auth });
  try {
    const meta = await drive.files.get({
      fileId: sheetId,
      fields: "id, name, mimeType",
    });
    console.log("[2/2] Drive metadata: OK -", meta.data.name, "/", meta.data.mimeType);
  } catch (e) {
    console.log("[2/2] Drive metadata: FAILED -", e.code, e.message);
    if (e.response?.data) console.log("Details:", JSON.stringify(e.response.data, null, 2));
  }
})();
