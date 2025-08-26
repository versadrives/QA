import serial
import time
import struct

# Configuration
SERIAL_PORT = "COM3"
BAUDRATE = 9600
ENERGY_METER_SLAVE_ID = 1
MP5W_SLAVE_ID = 3

# Register addresses for energy meter
ENERGY_PARAMETERS = [
    ("Active Power (W)", 3051),
    ("Power Factor", 3055),
]

def calc_crc(data):
    crc = 0xFFFF
    for pos in data:
        crc ^= pos
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc.to_bytes(2, byteorder='little')

def build_modbus_request(slave_id, function_code, register_address, register_count):
    msg = bytes([slave_id, function_code]) + register_address.to_bytes(2, 'big') + register_count.to_bytes(2, 'big')
    crc = calc_crc(msg)
    return msg + crc

def read_float_register(ser, slave_id, register):
    addr = register - 1
    request = build_modbus_request(slave_id, 0x03, addr, 2)

    ser.reset_input_buffer()
    ser.write(request)
    time.sleep(0.2)
    response = ser.read(9)

    # Validate response
    if len(response) != 9 or response[0] != slave_id or response[1] != 0x03:
        return None

    data_no_crc = response[:-2]
    crc_calc = calc_crc(data_no_crc)
    if response[-2:] != crc_calc:
        return None

    data = response[3:7]
    try:
        value = struct.unpack('>f', data)[0]
        if 0 <= value < 1e6:
            return value
    except struct.error:
        return None
    return None

def read_mp5w_rpm(ser, slave_id):
    start_addr = 0x03E9
    request = build_modbus_request(slave_id, 0x04, start_addr, 1)

    ser.reset_input_buffer()
    ser.write(request)
    time.sleep(0.5)
    response = ser.read(7)


    if len(response) != 7:
        print("Response length error")
        return None
    if response[0] != slave_id:
        print("Slave ID mismatch")
        return None
    if response[1] == (0x80 + 0x04):
        print(f"Exception code: {response[2]:02X}")
        return None
    if response[1] != 0x04:
        print(f"Unexpected function code: {response[1]:02X}")
        return None

    data_no_crc = response[:-2]
    crc_calc = calc_crc(data_no_crc)
    if response[-2:] != crc_calc:
        print("CRC check failed")
        return None

    rpm = (response[3] << 8) + response[4]
    return rpm

def open_serial(parity):
    return serial.Serial(
        port=SERIAL_PORT,
        baudrate=BAUDRATE,
        bytesize=8,
        parity=parity,
        stopbits=1,
        timeout=1
    )

def get_live_power_and_factor_and_rpm():
    try:
        # Read power and power factor from energy meter
        ser = open_serial(serial.PARITY_ODD)
        power = None
        power_factor = None

        for name, reg in ENERGY_PARAMETERS:
            val = read_float_register(ser, ENERGY_METER_SLAVE_ID, reg)
            if val is not None:
                if name == "Active Power (W)":
                    power = val
                elif name == "Power Factor":
                    power_factor = val
        ser.close()

        # Read RPM from MP5W
        time.sleep(0.1)
        ser = open_serial(serial.PARITY_NONE)
        rpm = read_mp5w_rpm(ser, MP5W_SLAVE_ID)
        ser.close()

        return round(power, 1) if power is not None else None, \
            round(power_factor, 2) if power_factor is not None else None, \
            rpm


    except Exception as e:
        print(f"Error reading RS485 data: {e}")
        return None, None, None

# For testing
if __name__ == "__main__":
    power, pf, rpm = get_live_power_and_factor_and_rpm()
    print(f"\nActive Power: {power}")
    print(f"Power Factor: {pf}")
    print(f"RPM: {rpm}")
