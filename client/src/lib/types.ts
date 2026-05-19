export interface Credentials {
  code: string;
  pass: string;
  /** True when the user chose to skip the Iran Air login. Online-only tabs
   *  render a "connect to server" prompt; FTL Checker still works fully. */
  offline?: boolean;
}

export type DutyKind =
  | 'OFF' | 'RSV' | 'FLIGHT' | 'TRAIN' | 'MED' | 'PASS' | 'MEET'
  | 'REJECT' | 'GROUND' | 'OTHER';

export interface RosterRow {
  status: string;
  action: string;
  crew: string;
  pos: string;
  dep: string;
  arr: string;
  depTime: string;
  arrTime: string;
  fltNo: string;
  acType: string;
  acReg: string;
  tip: string;
  fltMate: string;
  kind: DutyKind;
  kindCode: string;
  kindLabel: string;
}

export interface RosterResponse {
  ok: boolean;
  rangeLabel: string;
  rows: RosterRow[];
  warning?: string;
}

export interface FlightRow {
  _rowIndex: number;
  _eventTarget?: string;
  _eventArgument?: string;
  [key: string]: string | number | undefined;
}

export interface FlightsResponse {
  ok: boolean;
  date: string;
  headers: string[];
  flights: FlightRow[];
}

export interface CrewRow {
  [key: string]: string;
}

export interface CrewResponse {
  ok: boolean;
  date: string;
  headers: string[];
  crew: CrewRow[];
  flights: FlightRow[];
}
