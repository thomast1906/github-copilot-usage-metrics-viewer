import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecords, mergeParsedFiles } from '../src/parse.js';

test('parseRecords parses a JSON array export', () => {
  const records = parseRecords('[{"user_login":"a"},{"user_login":"b"}]');
  assert.equal(records.length, 2);
});

test('parseRecords parses NDJSON, one record per line', () => {
  const records = parseRecords('{"user_login":"a"}\n{"user_login":"b"}\n');
  assert.equal(records.length, 2);
});

test('parseRecords strips a leading UTF-8 BOM before parsing', () => {
  const records = parseRecords('﻿[{"user_login":"a"}]');
  assert.equal(records.length, 1);
});

test('parseRecords returns an empty array for blank input', () => {
  assert.deepEqual(parseRecords('   '), []);
});

test('parseRecords unwraps a {data: [...]} envelope', () => {
  const records = parseRecords('{"data":[{"user_login":"a"}]}');
  assert.equal(records.length, 1);
});

test('mergeParsedFiles flattens records from multiple files in order', () => {
  const records = mergeParsedFiles([
    { text: '[{"user_login":"a"}]' },
    { text: '{"user_login":"b"}' }
  ]);
  assert.deepEqual(records.map((r) => r.user_login), ['a', 'b']);
});
