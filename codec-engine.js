/* eslint-disable no-bitwise */
const lzString = require('lz-string');

const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const validJSONStartRegex = /^[ \n\r\t]*[{\\[]/;

const arrayBufferToBase64 = (arraybuffer) => {
  const bytes = new Uint8Array(arraybuffer);
  const len = bytes.length;
  let base64 = '';

  for (let i = 0; i < len; i += 3) {
    base64 += base64Chars[bytes[i] >> 2];
    base64 += base64Chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    base64 += base64Chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    base64 += base64Chars[bytes[i + 2] & 63];
  }

  if (len % 3 === 2) {
    base64 = `${base64.substring(0, base64.length - 1)}=`;
  } else if (len % 3 === 1) {
    base64 = `${base64.substring(0, base64.length - 2)}==`;
  }

  return base64;
};

const binaryToBase64Replacer = (_key, value) => {
  if (global.ArrayBuffer && value instanceof global.ArrayBuffer) {
    return {
      base64: true,
      data: arrayBufferToBase64(value),
    };
  }
  if (global.Buffer) {
    if (value instanceof global.Buffer) {
      return {
        base64: true,
        data: value.toString('base64'),
      };
    }
    // Some versions of Node.js convert Buffers to Objects before they are passed to
    // the replacer function - Because of this, we need to rehydrate Buffers
    // before we can convert them to base64 strings.
    if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
      let rehydratedBuffer;
      if (global.Buffer.from) {
        rehydratedBuffer = global.Buffer.from(value.data);
      } else {
        rehydratedBuffer = new global.Buffer(value.data);
      }
      return {
        base64: true,
        data: rehydratedBuffer.toString('base64'),
      };
    }
  }
  return value;
};

// Decode the data which was transmitted over the wire to a JavaScript Object in a format which SC understands.
// See encode function below for more details.
module.exports.decode = (input) => {
  if (input == null) {
    return null;
  }
  // Leave ping or pong message as is
  if (input === '#1' || input === '#2') {
    return input;
  }
  const message = input.toString();

  // Performance optimization to detect invalid JSON packet sooner.
  if (!validJSONStartRegex.test(message)) {
    return message;
  }

  try {
    const res = JSON.parse(message);
    if (res && typeof res === 'object' && res.p) {
      const [channel, compressedData, cid] = res.p;
      const data = lzString.decompress(compressedData);
      return {
        event: '#publish',
        data: {
          channel,
          data:
            data && validJSONStartRegex.test(data) ? JSON.parse(data) : data,
        },
        ...(cid != null ? { cid } : {}),
      };
    }
    return res;
  } catch (err) {
    // Return as string. It's not safe to send to SC until we have validated this as JSON.
  }
  return message;
};

// Encode a raw JavaScript object (which is in the SC protocol format) into a format for
// transfering it over the wire. In this case, we just convert it into a simple JSON string.
// If you want to create your own custom codec, you can encode the object into any format
// (e.g. binary ArrayBuffer or string with any kind of compression) so long as your decode
// function is able to rehydrate that object back into its original JavaScript Object format
// (which adheres to the SC protocol).
// See https://github.com/SocketCluster/socketcluster/blob/master/socketcluster-protocol.md
// for details about the SC protocol.

function shouldCompress(data) {
  return data && Array.isArray(data) && data.length > 1000;
}

module.exports.encode = (object) => {
  // Leave ping or pong message as is
  if (object === '#1' || object === '#2') {
    return object;
  }

  if (
    object.event === '#publish' &&
    object.data != null &&
    shouldCompress(object.data.data)
  ) {
    // publish event
    const compressedData = lzString.compress(JSON.stringify(object.data.data));
    const data = [object.data.channel, compressedData];
    if (object.cid != null) {
      data.push(object.cid);
    }
    return JSON.stringify({ p: data }, binaryToBase64Replacer);
  }

  return JSON.stringify(object, binaryToBase64Replacer);
};
