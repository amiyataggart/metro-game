// Curated per-line service tables (source of truth for line membership; spec §4).
// DRAFT for user review (Task 6) — not wired into the game or the pipeline yet.
import type { Service } from './types'
import { services as Bakerloo } from './Bakerloo'
import { services as C2c } from './C2c'
import { services as CableCar } from './CableCar'
import { services as Central } from './Central'
import { services as Chiltern } from './Chiltern'
import { services as Circle } from './Circle'
import { services as DLR } from './DLR'
import { services as District } from './District'
import { services as EastMidlandsRailway } from './EastMidlandsRailway'
import { services as ElizabethLine } from './ElizabethLine'
import { services as Eurostar } from './Eurostar'
import { services as GatwickExpress } from './GatwickExpress'
import { services as GreatNorthern } from './GreatNorthern'
import { services as GreatWesternRailway } from './GreatWesternRailway'
import { services as GreaterAnglia } from './GreaterAnglia'
import { services as HammersmithAndCity } from './HammersmithAndCity'
import { services as HeathrowExpress } from './HeathrowExpress'
import { services as Jubilee } from './Jubilee'
import { services as Liberty } from './Liberty'
import { services as Lioness } from './Lioness'
import { services as LondonNorthwestern } from './LondonNorthwestern'
import { services as Metropolitan } from './Metropolitan'
import { services as Mildmay } from './Mildmay'
import { services as Northern } from './Northern'
import { services as Piccadilly } from './Piccadilly'
import { services as SouthWesternRailway } from './SouthWesternRailway'
import { services as Southeastern } from './Southeastern'
import { services as SoutheasternHighSpeed } from './SoutheasternHighSpeed'
import { services as Southern } from './Southern'
import { services as Suffragette } from './Suffragette'
import { services as Thameslink } from './Thameslink'
import { services as Tramlink } from './Tramlink'
import { services as Victoria } from './Victoria'
import { services as WaterlooAndCity } from './WaterlooAndCity'
import { services as Weaver } from './Weaver'
import { services as Windrush } from './Windrush'

export type { Service } from './types'

export const SERVICES_BY_LINE: Record<string, Service[]> = {
  Bakerloo,
  C2c,
  CableCar,
  Central,
  Chiltern,
  Circle,
  DLR,
  District,
  EastMidlandsRailway,
  ElizabethLine,
  Eurostar,
  GatwickExpress,
  GreatNorthern,
  GreatWesternRailway,
  GreaterAnglia,
  HammersmithAndCity,
  HeathrowExpress,
  Jubilee,
  Liberty,
  Lioness,
  LondonNorthwestern,
  Metropolitan,
  Mildmay,
  Northern,
  Piccadilly,
  SouthWesternRailway,
  Southeastern,
  SoutheasternHighSpeed,
  Southern,
  Suffragette,
  Thameslink,
  Tramlink,
  Victoria,
  WaterlooAndCity,
  Weaver,
  Windrush,
}

export const SERVICES: Service[] = Object.values(SERVICES_BY_LINE).flat()
