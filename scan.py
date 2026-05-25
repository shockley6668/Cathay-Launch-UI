import smbus2 as smbus

def scan_i2c():
    # Use I2C bus 5 on RDK X5
    bus = smbus.SMBus(5)
    devices = []
    
    for address in range(0x03, 0x78):
        try:
            bus.read_byte(address)
            devices.append(hex(address))  # Addresses are stored in string format (e.g. '0x14')
        except OSError:
            pass
    
    bus.close()
    return devices  # Returns a list of all found addresses
