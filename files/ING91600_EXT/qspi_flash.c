#include <stdint.h>
#include "qspi_flash.h"

#include <stdio.h>
#include "ingsoc.h"

#define SPI_INT_BIT_END     (0x1 << bsSPI_INTREN_ENDINTEN)

static void WaitQSPIDone(void)
{
    while ((apSSP_GetIntRawStatus(AHB_QSPI) & SPI_INT_BIT_END) == 0);

    apSSP_ClearIntStatus(AHB_QSPI, SPI_INT_BIT_END);
}

static void SendCMD(uint8_t CMD)
{
    apSSP_sDeviceControlBlock param =
    {
        .eSclkDiv       = 0,
        .eSCLKPhase     = SPI_CPHA_ODD_SCLK_EDGES,
        .eSCLKPolarity  = SPI_CPOL_SCLK_LOW_IN_IDLE_STATES,
        .eLsbMsbOrder   = SPI_LSB_MOST_SIGNIFICANT_BIT_FIRST,
        .eDataSize      = SPI_DATALEN_8_BITS,
        .eMasterSlaveMode   = SPI_SLVMODE_MASTER_MODE,
        .eReadWriteMode     = SPI_TRANSMODE_NONE_DATA,
        .eQuadMode          = SPI_DUALQUAD_REGULAR_MODE,
        .eWriteTransCnt     = 1,
        .eReadTransCnt      = 1,
        .eAddrEn            = SPI_ADDREN_DISABLE,
        .eCmdEn             = SPI_CMDEN_ENABLE,
        .eInterruptMask     = SPI_INT_BIT_END,
        .TxThres            = 0,
        .RxThres            = 0,
        .SlaveDataOnly      = SPI_SLVDATAONLY_DISABLE,
        .eAddrLen           = SPI_ADDRLEN_1_BYTE,
    };

    apSSP_DeviceParametersSet(AHB_QSPI, &param);

    apSSP_WriteCmd(AHB_QSPI, 0, CMD);

    WaitQSPIDone();
}

static uint8_t read_reg_value(uint8_t cmd)
{
    uint32_t data = 0;
    apSSP_sDeviceControlBlock param =
    {
        .eSclkDiv       = 0,
        .eSCLKPhase     = SPI_CPHA_ODD_SCLK_EDGES,
        .eSCLKPolarity  = SPI_CPOL_SCLK_LOW_IN_IDLE_STATES,
        .eLsbMsbOrder   = SPI_LSB_MOST_SIGNIFICANT_BIT_FIRST,
        .eDataSize      = SPI_DATALEN_8_BITS,
        .eMasterSlaveMode   = SPI_SLVMODE_MASTER_MODE,
        .eReadWriteMode     = SPI_TRANSMODE_READ_ONLY,
        .eQuadMode          = SPI_DUALQUAD_REGULAR_MODE,
        .eWriteTransCnt     = 1,
        .eReadTransCnt      = 1,
        .eAddrEn            = SPI_ADDREN_DISABLE,
        .eCmdEn             = SPI_CMDEN_ENABLE,
        .eInterruptMask     = SPI_INT_BIT_END,
        .TxThres            = 0,
        .RxThres            = 0,
        .SlaveDataOnly      = SPI_SLVDATAONLY_DISABLE,
        .eAddrLen           = SPI_ADDRLEN_1_BYTE,
    };

    apSSP_DeviceParametersSet(AHB_QSPI, &param);

    apSSP_WriteCmd(AHB_QSPI, 0, cmd);

    WaitQSPIDone();

    apSSP_ReadFIFO(AHB_QSPI, &data);
    return data & 0xff;
}

static uint8_t ReadStatusRegLSB(void)
{
    return read_reg_value(0x05);
}

static uint8_t ReadStatusRegMSB(void)
{
    return read_reg_value(0x35);
}

uint16_t ext_flash_read_status_reg(void)
{
    uint16_t r = ReadStatusRegMSB() << 8;
    r |= ReadStatusRegLSB();
    return r;
}

void DeepPowerDown(void)
{
    SendCMD(0xB9);
}

void WriteEnable(void)
{
    SendCMD(0x06);
}

void WaitWIPDown(void)
{
    while ((ReadStatusRegLSB() & 0x1) == 0x1) ;
}

void ext_flash_sector_erase(uint32_t addr)
{
    WriteEnable();

    apSSP_sDeviceControlBlock param =
    {
        .eSclkDiv       = 0,
        .eSCLKPhase     = SPI_CPHA_ODD_SCLK_EDGES,
        .eSCLKPolarity  = SPI_CPOL_SCLK_LOW_IN_IDLE_STATES,
        .eLsbMsbOrder   = SPI_LSB_MOST_SIGNIFICANT_BIT_FIRST,
        .eDataSize      = SPI_DATALEN_8_BITS,
        .eMasterSlaveMode   = SPI_SLVMODE_MASTER_MODE,
        .eReadWriteMode     = SPI_TRANSMODE_WRITE_ONLY,
        .eQuadMode          = SPI_DUALQUAD_REGULAR_MODE,
        .eWriteTransCnt     = 3,
        .eReadTransCnt      = 1,
        .eAddrEn            = SPI_ADDREN_DISABLE,
        .eCmdEn             = SPI_CMDEN_ENABLE,
        .eInterruptMask     = SPI_INT_BIT_END,
        .TxThres            = 0,
        .RxThres            = 0,
        .SlaveDataOnly      = SPI_SLVDATAONLY_DISABLE,
        .eAddrLen           = SPI_ADDRLEN_1_BYTE,
    };

    apSSP_DeviceParametersSet(AHB_QSPI, &param);

    apSSP_WriteCmd(AHB_QSPI, 0, 0x20);
    apSSP_WriteFIFO(AHB_QSPI, addr & 0xff);
    apSSP_WriteFIFO(AHB_QSPI, (addr >> 8) & 0xff);
    apSSP_WriteFIFO(AHB_QSPI, (addr >> 16) & 0xff);

    WaitQSPIDone();

    WaitWIPDown();
}

#define io_read(a)       (*(volatile uint32_t*)(a))

static void ext_flash_page_program(uint32_t addr, uint8_t *data, int len)
{
    uint32_t i;

    WriteEnable();

    apSSP_sDeviceControlBlock param =
    {
        .eSclkDiv       = 0,
        .eSCLKPhase     = SPI_CPHA_ODD_SCLK_EDGES,
        .eSCLKPolarity  = SPI_CPOL_SCLK_LOW_IN_IDLE_STATES,
        .eLsbMsbOrder   = SPI_LSB_MOST_SIGNIFICANT_BIT_FIRST,
        .eDataSize      = SPI_DATALEN_8_BITS,
        .eMasterSlaveMode   = SPI_SLVMODE_MASTER_MODE,
        .eReadWriteMode     = SPI_TRANSMODE_WRITE_ONLY,
        .eQuadMode          = SPI_DUALQUAD_REGULAR_MODE,
        .eWriteTransCnt     = 3 + len,
        .eReadTransCnt      = 1,
        .eAddrEn            = SPI_ADDREN_DISABLE,
        .eCmdEn             = SPI_CMDEN_ENABLE,
        .eInterruptMask     = SPI_INT_BIT_END,
        .TxThres            = 0,
        .RxThres            = 0,
        .SlaveDataOnly      = SPI_SLVDATAONLY_DISABLE,
        .eAddrLen           = SPI_ADDRLEN_1_BYTE,
    };

    apSSP_DeviceParametersSet(AHB_QSPI, &param);

    apSSP_WriteCmd(AHB_QSPI, 0, 0x02);
    apSSP_WriteFIFO(AHB_QSPI, addr & 0xff);
    apSSP_WriteFIFO(AHB_QSPI, (addr >> 8) & 0xff);
    apSSP_WriteFIFO(AHB_QSPI, (addr >> 16) & 0xff);

    // data
    for (i = 0; i < len; i++)
    {
        while (apSSP_TxFifoFull(AHB_QSPI)) ;
        apSSP_WriteFIFO(AHB_QSPI, data[i]);
    }

    WaitQSPIDone();

    WaitWIPDown();
}

int ext_flash_program(uint32_t addr, uint8_t *data, int size)
{
    uint32_t next_sector = 0;

    if (addr & (EXT_FLASH_SECTOR_SIZE - 1)) return -1;
    while (size > 0)
    {
        ext_flash_sector_erase(addr);
        next_sector = addr + EXT_FLASH_SECTOR_SIZE;

        while ((addr < next_sector) && (size > 0))
        {
            int remain = next_sector - addr;
            remain = remain > size ? size : remain;
            int block = remain > EXT_FLASH_PAGE_SIZE ? EXT_FLASH_PAGE_SIZE : remain;
            ext_flash_page_program(addr, data, block);
            data += block;
            addr += block;
            size -= block;
        }
    }

    return 0;
}

void ext_flash_set_status_reg(uint16_t data)
{
    WriteEnable();

    apSSP_sDeviceControlBlock param =
    {
        .eSclkDiv       = 0,
        .eSCLKPhase     = SPI_CPHA_ODD_SCLK_EDGES,
        .eSCLKPolarity  = SPI_CPOL_SCLK_LOW_IN_IDLE_STATES,
        .eLsbMsbOrder   = SPI_LSB_MOST_SIGNIFICANT_BIT_FIRST,
        .eDataSize      = SPI_DATALEN_8_BITS,
        .eMasterSlaveMode   = SPI_SLVMODE_MASTER_MODE,
        .eReadWriteMode     = SPI_TRANSMODE_WRITE_ONLY,
        .eQuadMode          = SPI_DUALQUAD_REGULAR_MODE,
        .eWriteTransCnt     = 2,
        .eReadTransCnt      = 1,
        .eAddrEn            = SPI_ADDREN_DISABLE,
        .eCmdEn             = SPI_CMDEN_ENABLE,
        .eInterruptMask     = SPI_INT_BIT_END,
        .TxThres            = 0,
        .RxThres            = 0,
        .SlaveDataOnly      = SPI_SLVDATAONLY_DISABLE,
        .eAddrLen           = SPI_ADDRLEN_1_BYTE,
    };

    apSSP_DeviceParametersSet(AHB_QSPI, &param);

    apSSP_WriteCmd(AHB_QSPI, 0, 0x01);
    apSSP_WriteFIFO(AHB_QSPI, data & 0xff);
    apSSP_WriteFIFO(AHB_QSPI, (data >> 8) & 0xff);

    WaitQSPIDone();

    WaitWIPDown();
}

void ext_flash_chip_erase(void)
{
    WriteEnable();

    SendCMD(0x60);
}