import ExcelJS from 'exceljs';
import { inflateRawSync } from 'node:zlib';
import { ApiError } from '../../errors.js';

const headers: Record<string, { required: string[]; optional: string[] }> = {
  students: { required: ['name', 'birthDate', 'ssn', 'status'], optional: ['graduationDate'] },
  professors: { required: ['name', 'birthDate', 'ssn', 'status', 'department'], optional: [] },
  'historical-grades': { required: ['studentNumber', 'courseId', 'termId', 'grade'], optional: [] },
  qualifications: { required: ['professorNumber', 'courseId'], optional: [] },
};
export type ParsedRow = { row: number; values: Record<string, string>; error?: string };
const invalid = () => new ApiError(400, 'INVALID_FILE', '只接受符合模板的安全 xlsx 文件');

// Validate and bounded-inflate every ZIP member before handing the workbook to ExcelJS.
// This rejects forged central-directory lengths as well as ordinary compression bombs.
function validateZip(buffer: Buffer) {
  if (buffer.length > 5 * 1024 * 1024) throw new ApiError(413, 'FILE_TOO_LARGE', '文件超过 5 MiB');
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0) throw invalid();
  const count = buffer.readUInt16LE(end + 10); let offset = buffer.readUInt32LE(end + 16); let expanded = 0;
  if (count > 2000 || offset >= end) throw invalid();
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) throw invalid();
    const flags = buffer.readUInt16LE(offset + 8); const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 24); const compressed = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28); const extraLength = buffer.readUInt16LE(offset + 30); const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (names.has(name) || name.includes('..') || name.startsWith('/') || /externalLinks|vbaProject/i.test(name) || (flags & 1) || ![0, 8].includes(method)) throw invalid();
    names.add(name); expanded += size;
    if (expanded > 20 * 1024 * 1024) throw new ApiError(413, 'FILE_TOO_LARGE', '展开文件超过 20 MiB');
    const local = buffer.readUInt32LE(offset + 42);
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) throw invalid();
    const dataOffset = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    if (dataOffset + compressed > offset && dataOffset + compressed > buffer.readUInt32LE(end + 16)) throw invalid();
    const data = buffer.subarray(dataOffset, dataOffset + compressed);
    const actual = method === 0 ? data : inflateRawSync(data, { maxOutputLength: Math.max(1, Math.min(size + 1, 20 * 1024 * 1024)) });
    if (actual.length !== size) throw invalid();
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (!names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) throw invalid();
}

export async function parseXlsx(kind: string, buffer: Buffer): Promise<ParsedRow[]> {
  const spec = headers[kind]; if (!spec) throw invalid();
  try {
    validateZip(buffer);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as never);
    const sheet = workbook.worksheets[0]; if (!sheet || sheet.columnCount > 50 || sheet.rowCount > 5001) throw invalid();
    const columns: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, cell => {
      if (typeof cell.value !== 'string') throw invalid(); columns.push(cell.value);
    });
    if (new Set(columns).size !== columns.length || spec.required.some(h => !columns.includes(h)) || columns.some(h => ![...spec.required, ...spec.optional].includes(h))) throw invalid();
    const rows: ParsedRow[] = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i); if (!row.hasValues) continue;
      const parsed: ParsedRow = { row: i, values: {} };
      for (let j = 0; j < columns.length; j++) {
        const key = columns[j]!; const value = row.getCell(j + 1).value;
        if (value === null || value === undefined) { parsed.values[key] = ''; continue; }
        if (value instanceof Date && (key === 'birthDate' || key === 'graduationDate')) { parsed.values[key] = value.toISOString().slice(0, 10); continue; }
        if (typeof value !== 'string') { parsed.error = '单元格必须为文本；不接受公式、链接或数值编号'; continue; }
        parsed.values[key] = value.trim();
      }
      if (row.cellCount > columns.length) parsed.error = '出现未定义列';
      rows.push(parsed);
    }
    return rows;
  } catch (error) { if (error instanceof ApiError) throw error; throw invalid(); }
}
