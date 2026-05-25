import smbus2
import RPi.GPIO as GPIO
import time

# I2C address
GT911_I2C_ADDR          = 0x5D
# Some register addresses
COMMAND_REG             = 0x8040
CONFIG_VERSION_REG      = 0x8047
X_OUTPUT_MAX_LOW_REG    = 0x8048
X_OUTPUT_MAX_HIGH_REG   = 0x8049
Y_OUTPUT_MAX_LOW_REG    = 0x804A
Y_OUTPUT_MAX_HIGH_REG   = 0x804B
TOUCH_NUMBER_REG        = 0x804C
COORDINATE_INFO_REG     = 0x814E
POINT_1_X_LOW_REG       = 0x8150
POINT_1_X_HIGH_REG      = 0x8151
POINT_1_Y_LOW_REG       = 0x8152
POINT_1_Y_HIGH_REG      = 0x8153
MODULE_SWITCH_REG       = 0x804D

GT_CFG_VERSION_REG      = 0x8047

GT_CFG_START_REG        = 0x8047        # Config data start address
GT_CFG_END_REG          = 0x80FE        # Config data end address
GT_CHECKSUM_REG         = 0x80FF        # Checksum register
GT_FLASH_SAVE_REG       = 0x8100        # Flash save control register

CFG_TOTAL_LENGTH        = 184           # 0x8047~0x80FE total 184 bytes
chunk_size              = 32            # Max bytes per I2C write (adjust according to device limit)

GT911_TOUCH_MAX_POINTS  = 5
# INT pin
INT_PIN                 = 4
RST_PIN                 = 1

TP_PRES_DOWN            = 0x80          # Touch pressed
TP_CATH_PRES            = 0x40          # Touch point detected
CT_MAX_TOUCH            =  5            # Max supported touch points, fixed to 5

COORDINATE_X_MAX        = 320
COORDINATE_Y_MAX        = 480

GT911_CFG_TBL = [  
    # 0x8047 ~ 0x80FE
    0xFF, 0x40, 0x01, 0xE0, 0x01, 0x05, 0x81, 0x00, 0x08, 0xFF,
    0x1E, 0x0F, 0x5A, 0x3C, 0x03, 0x05, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x89, 0x20, 0x06,
    0x37, 0x35, 0x43, 0x06, 0x00, 0x00, 0x01, 0xB9, 0x03, 0x1C,
    0x63, 0x00, 0x00, 0x00, 0x00, 0x03, 0x64, 0x32, 0x00, 0x00,
    0x00, 0x28, 0x64, 0x94, 0xC5, 0x02, 0x07, 0x00, 0x00, 0x04,
    0x99, 0x2C, 0x00, 0x84, 0x34, 0x00, 0x71, 0x3F, 0x00, 0x5E,
    0x4C, 0x00, 0x4F, 0x5B, 0x00, 0x4F, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x0C, 0x0A, 0x08, 0x06, 0x04, 0x02, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x0A, 0x0C, 0x0F, 0x10, 0x08, 0x06, 0x04, 0x02,
    0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00]

def scan_i2c():
    # Create an SMBus object to represent the I2C-1 bus
    bus = smbus.SMBus(1)  # The I2C-1 bus number of the Raspberry Pi is 1
    devices = []

    # Scan I2C address 0x03 to 0x77
    for address in range(0x03, 0x78):
        try:
            # Try reading one byte from each address and check if the device responds
            bus.read_byte(address)
            devices.append(hex(address))
        except OSError:
            # The address was not responded by the device, continue scanning
            pass

    if devices:
#        print("I2C devices found at the following addresses:")
        for device in devices:
            print(f" - {device}")
#    else:
#        print("No I2C devices found.")

    # Turning off the I2C bus
    bus.close()

class gt911():
    def __init__(self,addr=GT911_I2C_ADDR) -> None:
        self.addr = addr  # Save device address
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(RST_PIN, GPIO.OUT)
        # GPIO.setup(INT_PIN, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)
        GPIO.setup(INT_PIN, GPIO.IN, pull_up_down=GPIO.PUD_OFF)
        GPIO.add_event_detect(INT_PIN, GPIO.RISING, callback=self.int_callback)
        self.I2C = smbus2.SMBus(1)
        # self.write_register(MODULE_SWITCH_REG,0x08)
        self.last_x = -1
        self.last_y = -1
        self.touch_rst()
        # self.gt911_send_cfg(config_table=GT911_CFG_TBL,mode=0)
        print("Start sending configuration...")
        self.write_register(0x8040, 0x02)
        time.sleep(0.01)  # Ensure reset is effective
        self.gt911_send_cfg(GT911_CFG_TBL, mode=0)
        time.sleep(0.01)  # Ensure reset is effective
        self.write_register(0x8040, 0x00)
        time.sleep(0.05)  # Ensure reset is complete
        print("Configuration sent successfully")
        # self.configure_resolution()

    def touch_rst(self):
        GPIO.output(RST_PIN, GPIO.LOW)
        time.sleep(0.01)
        GPIO.output(RST_PIN, GPIO.HIGH)
        time.sleep(0.05)

    def configure_resolution(self):
        # Set X-axis resolution (low 8 bits + high 4 bits)
        self.write_register(X_OUTPUT_MAX_LOW_REG, COORDINATE_X_MAX & 0xFF)        # Low 8 bits (320 �� 0x40)
        self.write_register(X_OUTPUT_MAX_HIGH_REG, (COORDINATE_X_MAX >> 8) & 0x0F) # High 4 bits (320 �� 0x01)
        # Set Y-axis resolution (low 8 bits + high 4 bits)
        self.write_register(Y_OUTPUT_MAX_LOW_REG, COORDINATE_Y_MAX & 0xFF)        # Low 8 bits (480 �� 0xE0)
        self.write_register(Y_OUTPUT_MAX_HIGH_REG, (COORDINATE_Y_MAX >> 8) & 0x0F) # High 4 bits (480 �� 0x01)

    def int_callback(self, channel):
        # Read number of touch points
        touch_num = self.read_register(COORDINATE_INFO_REG) & 0x0F  # Low 4 bits = number of points
        # touch_num = self.read_register(TOUCH_NUMBER_REG)
        if touch_num > 0:
            x_low   = self.read_register(POINT_1_X_LOW_REG)
            x_high  = self.read_register(POINT_1_X_HIGH_REG)
            y_low   = self.read_register(POINT_1_Y_LOW_REG)
            y_high  = self.read_register(POINT_1_Y_HIGH_REG)
            self.last_x = COORDINATE_X_MAX - ((x_high << 8) | x_low)  # Invert x-axis
            self.last_y = (y_high << 8) | y_low
        else:
            self.last_x = -1
            self.last_y = -1
        self.write_register(COORDINATE_INFO_REG, 0x00)
    
    def calculate_checksum(self,config_table):
        """Calculate checksum: two's complement of sum of all bytes"""
        checksum = sum(config_table) & 0xFF
        return (~checksum + 1) & 0xFF
    
    def write_register2(self, register, data):
        """Write to register (supports single or multiple bytes)"""
        if not isinstance(data, list):
            data = [data]
        max_data_per_write = 30
        for i in range(0, len(data), max_data_per_write):
            chunk = data[i:i+max_data_per_write]
            reg_high = (register >> 8) & 0xFF
            reg_low  = (register + i) & 0xFF
            try:
                #self.I2C.write_i2c_block_data(GT911_I2C_ADDR, reg_low, chunk)
                self.I2C.write_i2c_block_data(self.addr, reg_low, chunk)
                print(f"Write successful: Register 0x{(reg_high << 8) | reg_low:04X}, Length {len(chunk)}")
                time.sleep(0.01)
            except Exception as e:
                print(f"Write failed: Register 0x{(reg_high << 8) | reg_low:04X}, Error: {e}")
                raise
    
    # To be verified
    def gt911_send_cfg(self, config_table, mode=0):
        """Send configuration to GT911"""
        if len(config_table) != CFG_TOTAL_LENGTH:
            raise ValueError(f"Configuration data must be {CFG_TOTAL_LENGTH} bytes long")
        
        # Write configuration in chunks
        max_data_per_write = 30
        for i in range(0, CFG_TOTAL_LENGTH, max_data_per_write):
            chunk = config_table[i:i+max_data_per_write]
            self.write_register2(GT_CHECKSUM_REG + i, chunk)
        
        checksum = self.calculate_checksum(config_table)
        self.write_register2(GT_CHECKSUM_REG, [checksum, mode])
        current_version = self.read_register(GT_CFG_VERSION_REG)
        new_version = config_table[0]

        if new_version < current_version:
            raise ValueError(f"New version must be greater than current value 0x{current_version:02X}, but got 0x{new_version:02X}")
        
        # Calculate checksum (1's complement of the sum from 0x8047 to 0x80FE)
        checksum = sum(config_table) & 0xFF
        checksum = (~checksum + 1) & 0xFF  # Calculate 2's complement

        # Write configuration data in chunks
        for i in range(0, CFG_TOTAL_LENGTH, chunk_size):
            chunk = config_table[i:i+chunk_size]
            self.write_register2(GT_CFG_START_REG + i, chunk)
        
        # Write checksum
        self.write_register2(GT_CHECKSUM_REG, checksum)

        # Write checksum and mode
        checksum = self.calculate_checksum(config_table)
        self.write_register2(GT_CHECKSUM_REG, [checksum, mode])

        # Save to Flash
        if mode == 1:
            self.write_register2(GT_FLASH_SAVE_REG, 0x01)
            print("Configuration saved to Flash...")
        else:
            print("Configuration not saved to Flash...")

        # Trigger save to Flash (if needed)
        # self.write_register2(GT_FLASH_SAVE_REG,1 if mode else 0)

        print("Configuration applied" + (" and saved to Flash" if mode else " (temporary)"))

    def write_register(self, register, value):
        """Write to register"""
        #msg = smbus2.i2c_msg.write(GT911_I2C_ADDR, [register >> 8, register & 0xFF, value])
        msg = smbus2.i2c_msg.write(self.addr, [register >> 8, register & 0xFF, value])
        self.I2C.i2c_rdwr(msg)
        time.sleep(0.01)

    def read_register(self, register, length=1):
        """Read from register"""
        #self.I2C.write_i2c_block_data(GT911_I2C_ADDR, register >> 8, [register & 0xFF])
        self.I2C.write_i2c_block_data(self.addr, register >> 8, [register & 0xFF])
        time.sleep(0.01)
        #data = self.I2C.read_i2c_block_data(GT911_I2C_ADDR, register >> 8, length)
        data = self.I2C.read_i2c_block_data(self.addr, register >> 8, length)
        return data if length > 1 else data[0]
