// src/lib/chartParser.ts
// Lightweight .chart parser adapted for this game.
// Exposes parse (raw chart -> structured data), parseMetadata, toMoves, and parseChartToMoves.

// Types
export type NoteType = "strum" | "hopo" | "tap";
export type Timing = BPMChange | TimeSignature;

export interface BPMChange {
  ms: number;
  raw: string;
  point: number;
  bpm: number; // in BPM
}

export interface TimeSignature {
  ms: number;
  raw: string;
  point: number;
  top: number;
  bottom: number;
}

export interface Event {
  point: number;
  raw: string;
  ms: number;
  type: string;
  value: string;
}

export interface Note {
  ms: number;
  raw: string;
  notes: boolean[]; // length 6 (lanes 0..4 + lane 5=open)
  duration: number[]; // sustain length per lane in ms
  point: number; // tick position
  type: NoteType;
  powered: boolean;
}

export interface Notes {
  expert?: Note[];
  hard?: Note[];
  normal?: Note[];
  easy?: Note[];
}

export interface Chart {
  timing: Timing[];
  events: Event[];
  notes: Notes;
}

// Align move names with the game engine
// Emit the engine-native move names so consumers don't need to remap legacy names.
export type MoveType = "block" | "uppercut" | "hook";
export interface MoveHit {
  ms: number;
  move: MoveType;
  durationMS?: number;
  powered?: boolean;
  rawPoint: number;
  laneIndex: number; // 0..2 derived from chart lanes
}

// Internal timing point helper
type TP = {
  point: number;
  ms: number;
  measureLength: number; // in ms
};

// Utilities
const getMeasureLengthMS = (bpmMS: number) => (60000 / bpmMS) * 4 * 1000;
const numMeasures = (num: number, res: number) => num / (res * 4);

const getPosMS = (pos: number, timing: TP[], resolution: number) => {
  let tp: TP = { point: 0, ms: 0, measureLength: 0 };
  for (const point of timing) {
    if (point.point < pos) {
      tp = point;
    } else {
      break;
    }
  }
  const numberOfMeasures = numMeasures(pos - tp.point, resolution);
  const distance = tp.measureLength * numberOfMeasures;
  return distance + tp.ms;
};

const getSustainLength = (
  pos: number,
  duration: number,
  timing: TP[],
  resolution: number
) => {
  let tp: TP = { point: 0, ms: 0, measureLength: 0 };
  for (const point of timing) {
    if (point.point <= pos) {
      tp = point;
    } else {
      break;
    }
  }
  const numberOfMeasures = numMeasures(duration, resolution);
  return tp.measureLength * numberOfMeasures;
};

// Parsing INI-like .chart structure
type ChartINI = { [section: string]: { [key: string]: string[] } };

const parseINI = (text: string): ChartINI => {
  const lines = text.split(/\r?\n/);
  const object: ChartINI = {};
  let header = "";
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Ignore JS/HTML comment lines if accidentally loaded
    if (line.startsWith("//") || line.startsWith("<!DOCTYPE") || line.startsWith("<html")) continue;

    // section header
    if (line[0] === "[" && line[line.length - 1] === "]") {
      header = line.substring(1, line.length - 1);
      if (!object[header]) object[header] = {};
      continue;
    }

    // key = value
    const splitAt = line.indexOf(" = ");
    if (splitAt === -1) continue;
    const key = line.substring(0, splitAt);
    const value = line.substring(splitAt + 3);
    if (!key || value == null) continue;

    // If no valid header encountered yet, skip to avoid undefined access
    if (!header || !object[header]) continue;

    if (object[header][key]) object[header][key].push(value);
    else object[header][key] = [value];
  }
  return object;
};

// Helpers to iterate timing keys in ascending order
const sortedKeys = (obj?: Record<string, string[]>) =>
  obj ? Object.keys(obj).map((k) => parseInt(k)).sort((a, b) => a - b) : [];

// Build timing array and TP lookup
const getTiming = (
  data: Record<string, string[]>,
  resolution: number
): [Timing[], TP[]] => {
  const out: Timing[] = [];
  const TPArray: TP[] = [];

  let lastTimingPoint = { tp: 0, pos: 0, measureLength: 0 };

  for (const timingPointNum of sortedKeys(data)) {
    const timingPoint = String(timingPointNum);
    const events = data[timingPoint] || [];
    for (const event of events) {
      // BPM changes (B <bpm*1000>)
      if (/^B \d+/.test(event)) {
        const [, bpmStr] = event.split(" ");
        const measureLength = getMeasureLengthMS(parseInt(bpmStr));
        const numberOfMeasures = numMeasures(
          timingPointNum - lastTimingPoint.tp,
          resolution
        );
        const distance = lastTimingPoint.measureLength * numberOfMeasures;
        const position = distance + lastTimingPoint.pos;

        const point: BPMChange = {
          ms: position,
          raw: event,
          point: timingPointNum,
          bpm: parseInt(bpmStr) / 1000,
        };

        lastTimingPoint = {
          tp: timingPointNum,
          pos: position,
          measureLength,
        };

        out.push(point);
        TPArray.push({ point: point.point, ms: point.ms, measureLength });
      }

      // Time Signature (TS <top> [bottom power])
      if (/^TS \d+ *\d*/.test(event)) {
        const parts = event.split(" ");
        const topNum = parseInt(parts[1]);
        const bottomNum = isNaN(parseInt(parts[2])) ? 2 : parseInt(parts[2]);

        const numberOfMeasures = numMeasures(
          timingPointNum - lastTimingPoint.tp,
          resolution
        );
        const distance = lastTimingPoint.measureLength * numberOfMeasures;
        const position = distance + lastTimingPoint.pos;

        const point: TimeSignature = {
          ms: position,
          raw: event,
          point: timingPointNum,
          top: topNum,
          bottom: Math.pow(2, bottomNum),
        };

        out.push(point);
      }
    }
  }
  return [out, TPArray];
};

const getEvents = (
  data: Record<string, string[]>,
  timing: TP[],
  resolution: number
): Event[] => {
  const out: Event[] = [];

  for (const timingPointNum of sortedKeys(data)) {
    const events = data[String(timingPointNum)] || [];
    for (const event of events) {
      const eventRegex = event.match(/E "(\S* *)+"/);
      if (eventRegex) {
        const eventText = event.substring(3, event.length - 1);
        const eventType = eventText.split(" ")[0];
        const eventValue = eventText.replace(eventType, "").trim();

        const position = getPosMS(timingPointNum, timing, resolution);

        out.push({
          point: timingPointNum,
          raw: event,
          ms: position,
          type: eventType,
          value: eventValue,
        });
      }
    }
  }

  return out;
};

const convertToBitset = (list: boolean[]) => {
  const map = list.map((x) => (x ? 1 : 0));
  let out = 0;
  for (let i = 0; i < map.length; i++) out += Math.pow(map[i] * 2, i);
  return out;
};

const noteCount = (list: boolean[]) => list.filter(Boolean).length;

const getNoteType = (
  note: Note,
  previousNote: Note,
  forced: boolean,
  resolution: number
): NoteType => {
  if (note.type === "tap") return "tap";

  let naturallyStrum = true;
  const cutoffDistance = Math.floor(resolution / 3) + 1;

  if (
    noteCount(note.notes) === 1 &&
    note.point - previousNote.point <= cutoffDistance &&
    convertToBitset(note.notes) !== convertToBitset(previousNote.notes)
  ) {
    naturallyStrum = false;
  }

  let strum = naturallyStrum;
  if (forced) strum = !strum;

  return strum ? "strum" : "hopo";
};

const getNotes = (
  data: Record<string, string[]>,
  timing: TP[],
  resolution: number
): Note[] => {
  const out: Note[] = [];
  let starPower = { startPosition: 0, endPosition: 0 };
  let previousNote: Note = {
    ms: 0,
    raw: "",
    notes: [false, false, false, false, false, false],
    duration: [0, 0, 0, 0, 0, 0],
    point: 0,
    type: "strum",
    powered: false,
  };

  for (const timingPointNum of sortedKeys(data)) {
    const notes = data[String(timingPointNum)] || [];
    const position = getPosMS(timingPointNum, timing, resolution);
    let forced = false;

    const point: Note = {
      point: timingPointNum,
      raw: notes.join("\n"),
      ms: position,
      powered: false,
      notes: [false, false, false, false, false, false],
      type: "strum",
      duration: [0, 0, 0, 0, 0, 0],
    };

    for (const nline of notes) {
      if (/^N \d+ \d+/.test(nline)) {
        const [, typeStr, durationStr] = nline.split(" ");
        const lane = parseInt(typeStr);
        const durationNum = parseInt(durationStr);

        if (lane < 5) {
          point.notes[lane] = true;
          if (durationNum > 0) {
            point.duration[lane] = getSustainLength(
              point.point,
              durationNum,
              timing,
              resolution
            );
          }
          continue;
        }

        if (lane === 7) {
          // open note
          point.notes[5] = true;
          if (durationNum > 0) {
            point.duration[5] = getSustainLength(
              point.point,
              durationNum,
              timing,
              resolution
            );
          }
          continue;
        }

        if (lane === 6) {
          // tap
          point.type = "tap";
          continue;
        }

        if (lane === 5) {
          // force flip
          forced = true;
          continue;
        }
      }

      // Star Power
      if (/^S \d+ \d+/.test(nline)) {
        const parts = nline.split(" ");
        const duration = parseInt(parts[2]);
        starPower = {
          startPosition: point.point,
          endPosition: point.point + duration,
        };
      }
    }

    point.type = getNoteType(point, previousNote, forced, resolution);
    point.powered =
      point.point >= starPower.startPosition &&
      point.point < starPower.endPosition;

    previousNote = point;
    out.push(point);
  }

  return out;
};

// Public API
export const parse = (text: string): Chart => {
  const resolution = 192;
  const chartData = parseINI(text);

  const syncTrack = chartData["SyncTrack"] || {};
  const eventsSection = chartData["Events"] || {};

  const [timing, TPArray] = getTiming(syncTrack, resolution);
  const events = getEvents(eventsSection, TPArray, resolution);

  const notes: Notes = {};
  if (chartData["ExpertSingle"]) {
    notes.expert = getNotes(chartData["ExpertSingle"], TPArray, resolution);
  }
  if (chartData["HardSingle"]) {
    notes.hard = getNotes(chartData["HardSingle"], TPArray, resolution);
  }
  if (chartData["NormalSingle"]) {
    notes.normal = getNotes(chartData["NormalSingle"], TPArray, resolution);
  }
  if (chartData["EasySingle"]) {
    notes.easy = getNotes(chartData["EasySingle"], TPArray, resolution);
  }

  return { timing, events, notes };
};

export const parseMetadata = (text: string): { [key: string]: string } => {
  const parsed = parseINI(text);
  const out: { [key: string]: string } = {};
  const song = parsed["Song"] || {};
  for (const key of Object.keys(song)) out[key] = song[key][0];
  return out;
};

// Convert parsed chart into a list of move hits for this game.
// Mapping: lane 0 -> jab, 1 -> punch, 2 -> hook. Other lanes ignored.
export const toMoves = (
  chart: Chart,
  difficulty: keyof Notes = "expert"
): MoveHit[] => {
  const list = (chart.notes[difficulty] || []) as Note[];
  const out: MoveHit[] = [];

  for (const n of list) {
    const hitLanes = [0, 1, 2].filter((i) => n.notes[i]);
    for (const lane of hitLanes) {
      // Map chart lanes to engine moves: 0 -> block, 1 -> uppercut, 2 -> hook
      const move: MoveType = lane === 0 ? "block" : lane === 1 ? "uppercut" : "hook";
      const duration = n.duration[lane] || 0;
      out.push({
        ms: n.ms,
        move,
        durationMS: duration,
        powered: n.powered,
        rawPoint: n.point,
        laneIndex: lane,
      });
    }
  }

  out.sort((a, b) => (a.ms - b.ms) || a.move.localeCompare(b.move));
  return out;
};

export const parseChartToMoves = (
  text: string,
  difficulty: keyof Notes = "expert"
): MoveHit[] => toMoves(parse(text), difficulty);
