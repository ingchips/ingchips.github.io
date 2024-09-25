/***********************************************************************/
/*  This file is part of the ARM Toolchain package                     */
/*  Copyright (c) 2010 Keil - An ARM Company. All rights reserved.     */
/***********************************************************************/
/*                                                                     */
/*  FlashDev.C:  Device Description for New Device Flash               */
/*                                                                     */
/***********************************************************************/

#include "FlashOS.H"        // FlashOS Structures

#include "qspi_flash.h"

struct FlashDevice const FlashDevice  =  {
   FLASH_DRV_VERS,             // Driver Version, do not modify!
   "INGCHIPS 91600 EXT Flash", // Device Name
   EXTSPI,                     // Device Type
   0x04000000,                 // Device Start Address
   0x02000000,                 // Device Size in Bytes (max. 32MB)
   EXT_FLASH_SECTOR_SIZE,      // Programming Page Size
   0,                          // Reserved, must be 0
   0xFF,                       // Initial Content of Erased Memory
   800,                        // Program Page Timeout 100 mSec
   3000,                       // Erase Sector Timeout 3000 mSec

// Specify Size and Address of Sectors
   0x1000,0x000000,          // Sector Size 4kB
   SECTOR_END
};
