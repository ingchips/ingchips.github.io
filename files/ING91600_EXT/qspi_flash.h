#ifndef _qspi_flash_h
#define _qspi_flash_h

#include <stdint.h>

#ifdef __cplusplus
extern "C"
{
#endif

#define EXT_FLASH_PAGE_SIZE        256
#define EXT_FLASH_SECTOR_SIZE      4096
#define EXT_FLASH_ERASABLE_SIZE    EXT_FLASH_SECTOR_SIZE

void ext_flash_sector_erase(uint32_t addr);

int ext_flash_program(uint32_t addr, uint8_t *data, int size);

uint16_t ext_flash_read_status_reg(void);

void ext_flash_set_status_reg(uint16_t data);

void ext_flash_chip_erase(void);

#ifdef __cplusplus
}
#endif

#endif
