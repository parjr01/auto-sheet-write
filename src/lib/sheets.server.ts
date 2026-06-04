// Server-only Google Sheets gateway helper.
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
export const SPREADSHEET_ID = "1F8vHgPla-myhSS6JlVYLpQXxHzBw5rBY6Y4Me438zus";
export const HEADERS = [
  "meetingDate",
  "title",
  "owner",
  "priority",
  "status",
  "dueDate",
  "progress",
  "notes",
] as const;

function authHeaders() {
  const lovable = process.env.LOVABLE_API_KEY;
  const conn = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lovable || !conn) throw new Error("Sheets gateway credentials missing");
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": conn,
    "Content-Type": "application/json",
  };
}

async function gw(path: string, init?: RequestInit) {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Sheets API ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : {};
}

let cachedSheet: { id: string; title: string; sheetId: number } | null = null;
async function firstSheet() {
  if (cachedSheet && cachedSheet.id === SPREADSHEET_ID) return cachedSheet;
  const meta = await gw(`/spreadsheets/${SPREADSHEET_ID}?fields=sheets(properties(sheetId,title,index))`);
  const sheet = meta.sheets?.sort((a: any, b: any) => a.properties.index - b.properties.index)[0]?.properties;
  if (!sheet) throw new Error("No sheets found");
  cachedSheet = { id: SPREADSHEET_ID, title: sheet.title, sheetId: sheet.sheetId };
  return cachedSheet;
}

export type Row = Record<(typeof HEADERS)[number], string> & { _row: number };

async function ensureHeaders(sheetTitle: string) {
  const data = await gw(`/spreadsheets/${SPREADSHEET_ID}/values/${sheetTitle}!A1:H1`);
  const current: string[] = data.values?.[0] ?? [];
  const matches = HEADERS.every((h, i) => current[i] === h);
  if (!matches) {
    await gw(
      `/spreadsheets/${SPREADSHEET_ID}/values/${sheetTitle}!A1:H1?valueInputOption=RAW`,
      { method: "PUT", body: JSON.stringify({ values: [HEADERS as unknown as string[]] }) },
    );
  }
}

export async function listRows(): Promise<Row[]> {
  const sheet = await firstSheet();
  await ensureHeaders(sheet.title);
  const data = await gw(`/spreadsheets/${SPREADSHEET_ID}/values/${sheet.title}!A2:H10000`);
  const values: string[][] = data.values ?? [];
  return values.map((v, i) => {
    const row: any = { _row: i + 2 };
    HEADERS.forEach((h, idx) => (row[h] = v[idx] ?? ""));
    return row as Row;
  });
}

export async function appendRow(row: Record<string, string>) {
  const sheet = await firstSheet();
  await ensureHeaders(sheet.title);
  const values = [HEADERS.map((h) => row[h] ?? "")];
  await gw(
    `/spreadsheets/${SPREADSHEET_ID}/values/${sheet.title}!A:H:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values }) },
  );
}

export async function updateRow(rowNumber: number, row: Record<string, string>) {
  const sheet = await firstSheet();
  const values = [HEADERS.map((h) => row[h] ?? "")];
  await gw(
    `/spreadsheets/${SPREADSHEET_ID}/values/${sheet.title}!A${rowNumber}:H${rowNumber}?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: JSON.stringify({ values }) },
  );
}

export async function deleteRow(rowNumber: number) {
  const sheet = await firstSheet();
  await gw(`/spreadsheets/${SPREADSHEET_ID}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet.sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    }),
  });
}
