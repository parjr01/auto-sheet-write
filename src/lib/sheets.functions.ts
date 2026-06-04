import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RowSchema = z.object({
  meetingDate: z.string().max(40).default(""),
  title: z.string().min(1).max(300),
  owner: z.string().max(120).default(""),
  priority: z.enum(["Low", "Medium", "High", "Critical", ""]).default(""),
  status: z.enum(["Not Started", "In Progress", "Blocked", "Completed", ""]).default(""),
  dueDate: z.string().max(40).default(""),
  progress: z.string().max(10).default(""),
  notes: z.string().max(2000).default(""),
});

export const listSheetRows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listRows } = await import("./sheets.server");
    return { rows: await listRows() };
  });

export const addSheetRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RowSchema.parse(d))
  .handler(async ({ data }) => {
    const { appendRow } = await import("./sheets.server");
    await appendRow(data);
    return { ok: true };
  });

export const updateSheetRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ rowNumber: z.number().int().min(2).max(100000), row: RowSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const { updateRow } = await import("./sheets.server");
    await updateRow(data.rowNumber, data.row);
    return { ok: true };
  });

export const deleteSheetRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ rowNumber: z.number().int().min(2).max(100000) }).parse(d))
  .handler(async ({ data }) => {
    const { deleteRow } = await import("./sheets.server");
    await deleteRow(data.rowNumber);
    return { ok: true };
  });
