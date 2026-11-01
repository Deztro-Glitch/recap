import {
  IconArmchair, IconBath, IconBed, IconBolt, IconBox, IconDeviceLaptop, IconDoor, IconDroplet, IconFolder, IconHammer,
  IconHome, IconHorseToy, IconLamp, IconPaint, IconPlant2, IconSofa, IconStairs, IconTool, IconToolsKitchen2,
  IconWashMachine, type Icon,
} from '@tabler/icons-react'
import type { IconKey } from '../types'

export const ICONS: Record<IconKey, Icon> = {
  kitchen: IconToolsKitchen2,
  sofa: IconSofa,
  bed: IconBed,
  bath: IconBath,
  door: IconDoor,
  plant: IconPlant2,
  laptop: IconDeviceLaptop,
  toy: IconHorseToy,
  home: IconHome,
  laundry: IconWashMachine,
  stairs: IconStairs,
  box: IconBox,
  folder: IconFolder,
  paint: IconPaint,
  hammer: IconHammer,
  bolt: IconBolt,
  droplet: IconDroplet,
  armchair: IconArmchair,
  lamp: IconLamp,
  tool: IconTool,
}

export const iconFor = (key: string | undefined, fallback: Icon = IconHome) => ICONS[key as IconKey] ?? fallback
