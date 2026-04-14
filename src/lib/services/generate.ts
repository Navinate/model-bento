import type Anthropic from '@anthropic-ai/sdk';
import { parsePdf } from './pdf-parser';
import { extractModelCard, type ExtractedModel } from './llm-extractor';
import { checkModelExists } from './model-check';
import { db as defaultDb } from '../db';

type Db = typeof defaultDb;

type TextInput = { type: 'text'; text: string };
type PdfInput = { type: 'pdf'; buffer: Buffer };
type GenerateInput = TextInput | PdfInput;

interface GenerateOptions {
  client?: Anthropic;
  db?: Db;
}

type GenerateResult =
  | { status: 'success'; extracted: ExtractedModel; sourceText: string; sourceType: 'text' | 'pdf' }
  | { status: 'exists'; provider: string; name: string };

export async function processGeneration(
  input: GenerateInput,
  options?: GenerateOptions,
): Promise<GenerateResult> {
  // 1. Get raw text
  let sourceText: string;
  let sourceType: 'text' | 'pdf';

  if (input.type === 'pdf') {
    sourceText = await parsePdf(input.buffer);
    sourceType = 'pdf';
  } else {
    sourceText = input.text;
    sourceType = 'text';
  }

  // 2. Extract structured data
  const extracted = await extractModelCard(sourceText, { client: options?.client });

  // 3. Check if model already exists
  const check = await checkModelExists(extracted.provider, extracted.name, { db: options?.db });

  if (check.exists) {
    return { status: 'exists', provider: check.provider, name: check.name };
  }

  return { status: 'success', extracted, sourceText, sourceType };
}
