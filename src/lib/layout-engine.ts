import type { ExtractedModel } from './services/llm-extractor';

export interface LayoutCard {
  type: 'hero' | 'stat' | 'benchmark' | 'chart' | 'capabilities' | 'limitations' | 'highlight' | 'training';
  gridColumn: string;
  gridRow: string;
  data: Record<string, unknown>;
}

const GRID_COLS = 12;
const HIGH_SCORE_THRESHOLD = 70;

/**
 * Generate a bento grid layout from extracted model data.
 * Places cards in a 12-column grid, filling left-to-right, top-to-bottom.
 */
export function generateLayout(extracted: ExtractedModel): LayoutCard[] {
  const cards: Array<{ type: LayoutCard['type']; colSpan: number; rowSpan: number; data: Record<string, unknown> }> = [];

  // 1. Hero card is always first and 2x2
  cards.push({
    type: 'hero',
    colSpan: 2,
    rowSpan: 2,
    data: {
      displayName: extracted.display_name,
      provider: extracted.provider,
      description: extracted.description,
    },
  });

  // 2. Stat cards for key metrics
  if (extracted.parameter_count) {
    cards.push({
      type: 'stat',
      colSpan: 1,
      rowSpan: 1,
      data: { label: 'Parameters', value: extracted.parameter_count },
    });
  }

  if (extracted.context_window) {
    cards.push({
      type: 'stat',
      colSpan: 1,
      rowSpan: 1,
      data: { label: 'Context Window', value: extracted.context_window },
    });
  }

  // 3. Benchmarks — sorted by score descending, high scores get 2x1, low get 1x1
  const sortedBenchmarks = [...extracted.benchmarks].sort((a, b) => b.score - a.score);
  for (const bm of sortedBenchmarks) {
    cards.push({
      type: 'benchmark',
      colSpan: bm.score >= HIGH_SCORE_THRESHOLD ? 2 : 1,
      rowSpan: 1,
      data: { name: bm.name, score: bm.score, unit: bm.unit },
    });
  }

  // 4. Capabilities card (2x1) if any
  if (extracted.capabilities.length > 0) {
    cards.push({
      type: 'capabilities',
      colSpan: 2,
      rowSpan: 1,
      data: { capabilities: extracted.capabilities },
    });
  }

  // 5. Limitations card (2x1) if any
  if (extracted.limitations.length > 0) {
    cards.push({
      type: 'limitations',
      colSpan: 2,
      rowSpan: 1,
      data: { limitations: extracted.limitations },
    });
  }

  // 6. Highlight cards (1x1)
  for (const hl of extracted.highlights) {
    cards.push({
      type: 'highlight',
      colSpan: 1,
      rowSpan: 1,
      data: { label: hl.label, value: hl.value },
    });
  }

  // 7. Training card if cutoff exists
  if (extracted.training_data_cutoff) {
    cards.push({
      type: 'training',
      colSpan: 2,
      rowSpan: 1,
      data: { trainingDataCutoff: extracted.training_data_cutoff },
    });
  }

  // Pack cards into the grid
  return packGrid(cards);
}

/** Simple row-by-row grid packer for a 12-column grid. */
function packGrid(
  cards: Array<{ type: LayoutCard['type']; colSpan: number; rowSpan: number; data: Record<string, unknown> }>,
): LayoutCard[] {
  // Track which cells are occupied: Set of "col,row" strings
  const occupied = new Set<string>();
  const result: LayoutCard[] = [];

  let currentRow = 1;
  let currentCol = 1;

  for (const card of cards) {
    const placed = placeCard(card, occupied, currentRow, currentCol);
    if (placed) {
      result.push(placed.layoutCard);
      currentRow = placed.nextRow;
      currentCol = placed.nextCol;
    }
  }

  return result;
}

function placeCard(
  card: { type: LayoutCard['type']; colSpan: number; rowSpan: number; data: Record<string, unknown> },
  occupied: Set<string>,
  startRow: number,
  startCol: number,
): { layoutCard: LayoutCard; nextRow: number; nextCol: number } | null {
  // Scan from current position to find first available spot
  for (let row = startRow; row <= startRow + 50; row++) {
    const colStart = row === startRow ? startCol : 1;
    for (let col = colStart; col <= GRID_COLS - card.colSpan + 1; col++) {
      if (canPlace(occupied, col, row, card.colSpan, card.rowSpan)) {
        // Mark cells as occupied
        for (let c = col; c < col + card.colSpan; c++) {
          for (let r = row; r < row + card.rowSpan; r++) {
            occupied.add(`${c},${r}`);
          }
        }

        const layoutCard: LayoutCard = {
          type: card.type,
          gridColumn: `${col} / span ${card.colSpan}`,
          gridRow: `${row} / span ${card.rowSpan}`,
          data: card.data,
        };

        // Advance position
        const nextCol = col + card.colSpan;
        const nextRow = nextCol > GRID_COLS ? row + 1 : row;
        const adjustedCol = nextCol > GRID_COLS ? 1 : nextCol;

        return { layoutCard, nextRow, nextCol: adjustedCol };
      }
    }
  }

  return null;
}

function canPlace(
  occupied: Set<string>,
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
): boolean {
  for (let c = col; c < col + colSpan; c++) {
    for (let r = row; r < row + rowSpan; r++) {
      if (occupied.has(`${c},${r}`)) return false;
    }
  }
  return true;
}
