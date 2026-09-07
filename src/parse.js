export function parseRecords(text) {
  const clean = text.replace(/^﻿/, '').trim();
  if (!clean) return [];
  try {
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : (parsed.data || parsed.rows || [parsed]);
  } catch {
    return clean.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  }
}

export function mergeParsedFiles(files) {
  return files.flatMap((file) => parseRecords(file.text));
}
