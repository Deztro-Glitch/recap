import {
  IconBath, IconBed, IconBox, IconDeviceLaptop, IconDoor, IconHome, IconHorseToy,
  IconPlant2, IconSofa, IconStairs, IconToolsKitchen2, IconWashMachine, type Icon,
} from '@tabler/icons-react'
import type { RoomIcon } from '../types'

export const ROOM_ICONS: Record<RoomIcon, Icon> = {
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
}

export const roomIcon = (key: string | undefined) => ROOM_ICONS[key as RoomIcon] ?? IconHome
