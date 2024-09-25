
/***********************************************************************/
/*  This file is part of the ARM Toolchain package                     */
/*  Copyright (c) 2010 Keil - An ARM Company. All rights reserved.     */
/***********************************************************************/
/*                                                                     */
/*  FlashDev.C:  Flash Programming Functions adapted                   */
/*               for INGCHIPS 91800 512kB Flash                        */
/*                                                                     */
/***********************************************************************/

#include "FlashOS.H"        // FlashOS Structures

#include "qspi_flash.c"

static void HAL_INIT_ALL(void)
{
    SYSCTRL_ClearClkGateMulti((1 << SYSCTRL_ITEM_APB_PinCtrl)
                            | (1 << SYSCTRL_ITEM_AHB_SPI0));
    
    APB_PINCTRL->OUT_CTRL[4] = 0x000a9547; // 0x00001547
    APB_PINCTRL->OUT_CTRL[5] = 0x00054000; // 0x00000000
    APB_PINCTRL->IN_CTRL[0] = 0x01294864; // 0x01fffc64
    APB_PINCTRL->IN_CTRL[1] = 0x01ffd294; // 0x01ffffff
    APB_PINCTRL->IN_CTRL[3] = 0x01ffffff; // 0x01f17fff
    
    SYSCTRL_SelectSpiClk(SPI_PORT_0, SYSCTRL_CLK_SLOW);
    
    if (ext_flash_read_status_reg() != 0x0200)
        ext_flash_set_status_reg(0x0200);
}

static void enable_dcache(int flag)
{
    SYSCTRL_CacheControl(SYSCTRL_MEM_BLOCK_AS_CACHE, flag ? SYSCTRL_MEM_BLOCK_AS_CACHE : SYSCTRL_MEM_BLOCK_AS_SYS_MEM);
}

/*
   Mandatory Flash Programming Functions (Called by FlashOS):
                int Init        (unsigned long adr,   // Initialize Flash
                                 unsigned long clk,
                                 unsigned long fnc);
                int UnInit      (unsigned long fnc);  // De-initialize Flash
                int EraseSector (unsigned long adr);  // Erase Sector Function
                int ProgramPage (unsigned long adr,   // Program Page Function
                                 unsigned long sz,
                                 unsigned char *buf);

   Optional  Flash Programming Functions (Called by FlashOS):
                int BlankCheck  (unsigned long adr,   // Blank Check
                                 unsigned long sz,
                                 unsigned char pat);
                int EraseChip   (void);               // Erase complete Device
      unsigned long Verify      (unsigned long adr,   // Verify Function
                                 unsigned long sz,
                                 unsigned char *buf);

       - BlanckCheck  is necessary if Flash space is not mapped into CPU memory space
       - Verify       is necessary if Flash space is not mapped into CPU memory space
       - if EraseChip is not provided than EraseSector for all sectors is called
*/


/*
 *  Initialize Flash Programming Functions
 *    Parameter:      adr:  Device Base Address
 *                    clk:  Clock Frequency (Hz)
 *                    fnc:  Function Code (1 - Erase, 2 - Program, 3 - Verify)
 *    Return Value:   0 - OK,  1 - Failed
 */

int Init (unsigned long adr, unsigned long clk, unsigned long fnc) {
  HAL_INIT_ALL();
  return (0);                                  // Finished without Errors
}


/*
 *  De-Initialize Flash Programming Functions
 *    Parameter:      fnc:  Function Code (1 - Erase, 2 - Program, 3 - Verify)
 *    Return Value:   0 - OK,  1 - Failed
 */

int UnInit (unsigned long fnc) {
  return (0);                                  // Finished without Errors
}

/*
 *  Erase Sector in Flash Memory
 *    Parameter:      adr:  Sector Address
 *    Return Value:   0 - OK,  1 - Failed
 */

int EraseSector (unsigned long addr) {
  ext_flash_sector_erase(addr - AHB_QSPI_MEM_BASE);
  return (0);
}

unsigned long Verify(unsigned long addr,   // Verify Function
                     unsigned long sz,
                     unsigned char *buf)
{
  unsigned long i;
  unsigned char *p = (unsigned char *)(addr);
  for (i = 0; i < sz; i++)
  {
      if (p[i] != buf[i])
        break;
  }

  return addr + i;   // passed
}

/*
 *  Program Page in Flash Memory
 *    Parameter:      adr:  Page Start Address
 *                    sz:   Page Size
 *                    buf:  Page Data
 *    Return Value:   0 - OK,  1 - Failed
 */

int ProgramPage (unsigned long addr, unsigned long sz, unsigned char *buf)
{
    enable_dcache(0);
    int r = ext_flash_program(addr - AHB_QSPI_MEM_BASE, buf, (int)sz);
    enable_dcache(1);
    return r == 0 ? 0 : 1;
}
