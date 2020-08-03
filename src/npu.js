/* jshint esversion: 6 */
/* eslint "indent": [ "error", 4, { "SwitchCase": 1 } ] */

var npu = npu || {};
var base = base || require('./base');


npu.ModelFactory = class {

    match(context) {
        const identifier = context.identifier.toLowerCase();
        if (identifier.endsWith('.npumodel')) {
            let text = context.text;
            text = text.substring(0, Math.min(text.length, 32));
            if (text.search('#') != -1) {
                this.version = text.split('#').shift().trim();
                this.chip_no = text.split('#', 2)[1].substring(0,2);
            } else {
                this.version = text.substring(0,15);
            }
            if (this.version === '2020-06-09V0.08' || this.version === '2019-08-07V0.04') {
                return true;
            } else {
				throw new npu.Error('Unsupport npumodel version:' + this.version);
            }
        }

        return false;
    }

    open(context, host) {
        return npu.Metadata.open(host, this.version).then((metadata) => {
            const identifier = context.identifier.toLowerCase();
            try {
                return new npu.Model(metadata, context);
            }
            catch (error) {
                const message = error && error.message ? error.message : error.toString();
                throw new npu.Error(message.replace(/\.$/, '') + " in '" + identifier + "'.");
            }
        });
    }
};

npu.Model = class {

    constructor(metadata, context) {
        this._graphs = [];
        this._graphs.push(new npu.Graph(metadata, context));
    }

    get format() {
        return 'npu';
    }

    get graphs() {
        return this._graphs;
    }
};

npu.Graph = class {

    constructor(metadata, context) {
        this._inputs = [];
        this._outputs = [];
        this._nodes = [];
        var version;
        var chip_no;
        const text = context.text;
        var Layer_num;
        var model;
        if (text.search('#') <= 32) {
            version = text.split('#').shift().trim();
            chip_no = text.split('#', 2)[1].substring(0,2);
            switch (chip_no) {
                case '01': { //vc718
                    model = new npu.Binary718v4Reader(metadata, context.buffer);
                    break;
                }
                case '02': { //vc768
                    model = new npu.Binary768v8Reader(metadata, context.buffer);
                    break;
                }
            }
        } else { // old npumodel did't include chip number
            version = text.substring(0,15);
            if (version === '2019-08-07V0.04') { //vc718
                model = new npu.Binary718v4Reader(metadata, context.buffer);
            } else if (version === '2020-06-09V0.08') { //vc768
                model = new npu.Binary768v8Reader(metadata, context.buffer);
            }
        }

        Layer_num = model.Layer_num;
        for (let i = 1; i <= model.Layer_num; i++) {
            this._nodes.push(model.getLayer(metadata));
        }
    }

    get inputs() {
        return this._inputs;
    }

    get outputs() {
        return this._outputs;
    }

    get nodes() {
        return this._nodes;
    }
};

npu.Parameter = class {

    constructor(name, visible, args) {
        this._name = name;
        this._visible = visible;
        this._arguments = args;
    }

    get name() {
        return this._name;
    }

    get visible() {
        return this._visible;
    }

    get arguments() {
        return this._arguments;
    }
};

npu.Argument = class {

    constructor(name, type, initializer) {
        if (typeof name !== 'string') {
            throw new npu.Error("Invalid argument identifier '" + JSON.stringify(name) + "'.");
        }
        this._name = name;
        this._type = type || null;
        this._initializer = initializer || null;
    }

    get name() {
        return this._name;
    }

    get type() {
        if (this._initializer) {
            return this._initializer.type;
        }
        return this._type;
    }

    get initializer() {
        return this._initializer;
    }
};

npu.Node = class {

    constructor(metadata) {
        this._metadata = metadata;
        this._inputs = [];
        this._outputs = [];
        this._attributes = [];
        this._type = '';
        this._name = '';
    }

    get type() {
        return this._type;
    }
    set type(input_str) {
        this._type = input_str;
    }

    get name() {
        return this._name;
    }
    set name(input_str) {
        this._name = input_str;
    }

    get metadata() {
        return this._metadata.type(this._type);
    }

    get attributes() {
        return this._attributes;
    }
    append_attributes(input_obj) {
        if (input_obj) {
            this._attributes.push(input_obj);
        }
    }

    get inputs() {
        return this._inputs;
    }
    append_inputs(input_obj) {
        if (input_obj) {
            this._inputs.push(input_obj);
        }
    }

    get outputs() {
        return this._outputs;
    }
    append_outputs(input_obj) {
        if (input_obj) {
            this._outputs.push(input_obj);
        }
    }
};

npu.Attribute = class {

    constructor(schema, reader) {
        this._type = '';
        this._name = '';
        this._value = -1;
        if (schema) {
            this._name = schema.name;
            if (schema.type) {
                this._type = schema.type;
            }
            switch (this._type) {
                case 'bit16':
                    this._value = reader.getBit16(schema.mask);
                    break;
                case 'bit32':
                    this._value = reader.getBit32(schema.mask);
                    break;
                case 'uint16':
                    this._value = reader.getInt16(false);
                    break;
                case 'int16':
                    this._value = reader.getInt16(true);
                    break;
                case 'uint32':
                    this._value = reader.getInt32(false);
                    break;
                case 'int32':
                    this._value = reader.getInt32(true);
                    break;
                case 'float32':
                    this._value = reader.getFloat32();
                    break;
            }
            if (Object.prototype.hasOwnProperty.call(schema, 'visible') && !schema.visible) {
                this._visible = false;
            }
            else if (Object.prototype.hasOwnProperty.call(schema, 'default')) {
                if (this._value == schema.default || (this._value && this._value.toString() == schema.default.toString())) {
                    this._visible = false;
                }
            }
        }
    }

    get type() {
        return this._type;
    }
    set type(input_str) {
        this._type = input_str;
    }

    get name() {
        return this._name;
    }
    set name(input_str) {
        this._name = input_str;
    }

    get value() {
        return this._value;
    }
    set value(input_num) {
        this._value = input_num;
    }

    get visible() {
        return this._visible == false ? false : true;
    }
    set visible(input_bool) {
        this._visible = input_bool;
    }
};

npu.Tensor = class {

    constructor(id, type, data) {
        this._type = type;
        this._data = data;
        this._id = id;
    }

    get id() {
        return this._id;
    }
    get kind() {
        return 'Weight';
    }

    get type() {
        return this._type;
    }

    get state() {
        return this._context().state || null;
    }

    get value() {
        const context = this._context();
        if (context.state) {
            return null;
        }
        context.limit = Number.MAX_SAFE_INTEGER;
        return this._decode(context, 0);
    }

    toString() {
        const context = this._context();
        if (context.state) {
            return '';
        }
        context.limit = 10000;
        const value = this._decode(context, 0);
        return JSON.stringify(value, null, 4);
    }

    _context() {
        const context = {};
        context.index = 0;
        context.count = 0;
        context.state = null;

        if (this._type.dataType == '?') {
            context.state = 'Tensor has unknown data type.';
            return context;
        }
        if (!this._type.shape) {
            context.state = 'Tensor has no dimensions.';
            return context;
        }

        if (!this._data) {
            context.state = 'Tensor data is empty.';
            return context;
        }

        switch (this._type.dataType) {
            case 'float16':
            case 'float32':
                context.data = new DataView(this._data.buffer, this._data.byteOffset, this._data.byteLength);
                break;
            default:
                context.state = 'Tensor data type is not implemented.';
                break;
        }

        context.dataType = this._type.dataType;
        context.shape = this._type.shape.dimensions;
        return context;
    }

    _decode(context, dimension) {
        const shape = context.shape.length !== 0 ? context.shape : [ 1 ];
        const results = [];
        const size = shape[dimension];
        if (dimension == shape.length - 1) {
            for (let i = 0; i < size; i++) {
                if (context.count > context.limit) {
                    results.push('...');
                    return results;
                }
                switch (this._type.dataType) {
                    case 'float32':
                        results.push(context.data.getFloat32(context.index, true));
                        context.index += 4;
                        context.count++;
                        break;
                    case 'float16':
                        results.push(context.data.getFloat16(context.index, true));
                        context.index += 2;
                        context.count++;
                        break;
                }
            }
        }
        else {
            for (let j = 0; j < size; j++) {
                if (context.count > context.limit) {
                    results.push('...');
                    return results;
                }
                results.push(this._decode(context, dimension + 1));
            }
        }
        if (context.shape.length == 0) {
            return results[0];
        }
        return results;
    }
};

npu.TensorType = class {

    constructor(dataType, shape) {
        this._dataType = dataType || '?';
        this._shape = shape;
    }

    get dataType() {
        return this._dataType;
    }

    get shape() {
        return this._shape;
    }

    toString() {
        return this._dataType + this._shape.toString();
    }
};

npu.TensorShape = class {

    constructor(dimensions) {
        this._dimensions = dimensions;
    }

    get dimensions() {
        return this._dimensions;
    }

    toString() {
        return this._dimensions ? ('[' + this._dimensions.map((dimension) => dimension ? dimension.toString() : '?').join(',') + ']') : '';
    }
};

npu.Metadata = class {

    static open(host, version) {
        let json_url = 'npu-metadata';
        switch (version) {
            case '2020-06-09V0.08':
                json_url = json_url + '768v8.json';
                break;
            case '2019-08-07V0.04':
                json_url = json_url + '718v4.json';
                break;
        }
        if (npu.Metadata._metadata) {
            return Promise.resolve(npu.Metadata._metadata);
        }
        return host.request(null, json_url, 'utf-8').then((data) => {
            npu.Metadata._metadata = new npu.Metadata(data);
            return npu.Metadata._metadata;
        }).catch(() => {
            npu.Metadata._metadata = new npu.Metadata(null);
            return npu.Metadata._metadatas;
        });
    }

    constructor(data) {
        this._operatorMap = new Map();
        this._map = new Map();
        this._attributeCache = new Map();
        if (data) {
            const items = JSON.parse(data);
            if (items) {
                for (const item of items) {
                    if (item.name && item.schema) {
                        item.schema.name = item.name;
                        this._map.set(item.name, item.schema);
                        if (Object.prototype.hasOwnProperty.call(item.schema, 'Opera')) {
                            this._operatorMap.set(item.schema.Opera, item.name);
                        }
                    }
                }
            }
        }
    }

    operator(code) {
        return this._operatorMap.get(code);
    }

    type(name) {
        return this._map.get(name);
    }

    attribute(type, name) {
        const key = type + ':' + name;
        if (!this._attributeCache.has(key)) {
            const schema = this.type(type);
            if (schema && schema.attributes && schema.attributes.length > 0) {
                for (const attribute of schema.attributes) {
                    this._attributeCache.set(type + ':' + attribute.name, attribute);
                }
            }
            if (!this._attributeCache.has(key)) {
                this._attributeCache.set(key, null);
            }
        }
        return this._attributeCache.get(key);
    }
};

npu.Binary718v4Reader = class {
    constructor(metadata, buffer) {
        this.reader = new npu.BinaryReader(buffer);
        this.Version = this.reader.getStr(32);
        this.Name = this.reader.getStr(32);
        this.Layer_num = this.reader.getInt32(false);
        this.HwCmdBaseAddr = this.reader.getInt32(false);
        this.HwCmdBaseVaddr = this.reader.getInt32(false);
        this.reader.skip(4);
        this.StartLayer = this.reader.getInt32(false);
        this.reader.skip(4*31);
        this.EndLayer = this.reader.getInt32(false);
        this.reader.skip(4*31);
        this.Hardware_Layer_num = this.reader.getInt32(false);
        this.Hardware_Start_Layer = this.reader.getInt32(false);
        this.Hardware_Exec_Layer = this.reader.getInt32(false);
        this.Hardware_Command_Reg_Addr = this.reader.getInt32(false);

        console.log('Version:' + this.Version.split('#').shift().trim());
        console.log('Name:'+this.Name);
        console.log(this.Layer_num + ' layers, ' + this.Hardware_Layer_num + ' hardware layers.');
        console.log('StartLayer: ' + this.StartLayer + ' EndLayer: ' + this.EndLayer);
        console.log('Hardware_Layer_num: ' + this.Hardware_Start_Layer + ' Hardware_Exec_Layer: ' + this.Hardware_Exec_Layer);
        console.log('HwCmdRegAddr:'+ this.Hardware_Command_Reg_Addr.toString(16));
    }

    getLayer(metadata) {
        const data_length = 96;
        const longest_param = 64;
        var node = new npu.Node(metadata);
        var in_num = this.reader.getInt32(false);
        var out_num = this.reader.getInt32(false);
        this.reader.skip(8);

        var inputs = [];
        var outputs = [];

        for (let i = 1; i <= 4; i++) {
            if (i <= in_num) {
                const blob_reader = new npu.BlobReader718v4(this.reader);
                inputs.push(blob_reader.getBlob());
            } else {
                inputs.push(null);
                this.reader.skip(data_length);
            }
        }

        for (let o = 1; o <= 2; o++) {
            if (o <= out_num) {
                const blob_reader = new npu.BlobReader718v4(this.reader);
                outputs.push(blob_reader.getBlob());
            } else {
                outputs.push(null);
                this.reader.skip(data_length);
            }
        }

        var opera_code = this.reader.getInt32(false);
        this.reader.skip(3*4);
        node.name = this.reader.getStr(32);
        node.type = metadata.operator(opera_code);

        const meta_input_blobs = metadata.type(node.type).inputs;
        for (const meta_input_blob of meta_input_blobs) {
            var blob = inputs.shift();
            if (blob !== null) {
                var blob_arg = new npu.Argument(blob.id.toString(), meta_input_blob.name, blob);
                node.append_inputs(new npu.Parameter(meta_input_blob.name, true, [blob_arg]));
            }
        }

        const meta_output_blobs = metadata.type(node.type).outputs;
        for (const meta_output_blob of meta_output_blobs) {
            var blob = outputs.shift();
            if (blob !== null) {
                var blob_arg = new npu.Argument(blob.id.toString(), meta_output_blob.name, blob);
                node.append_outputs(new npu.Parameter(meta_output_blob.name, true, [blob_arg]));
            }
        }

        const schema = metadata.type(node.type);
        const attributeMetadata = schema && schema.attributes ? schema && schema.attributes : [];
        var current_param_length = 0;
        for (const attribute of attributeMetadata) {
            node.append_attributes(new npu.Attribute(attribute, this.reader));
            switch (attribute.type) {
                case 'bit16':
                case 'bit32':
                    break;
                case 'uint16':
                case 'int16':
                    current_param_length = current_param_length + 2;
                    break;
                case 'uint32':
                case 'int32':
                case 'float32':
                    current_param_length = current_param_length + 4;
                    break;
            }
        }
        this.reader.skip(longest_param - current_param_length);

        return node;
    }
};

npu.Binary768v8Reader = class {
    constructor(metadata, buffer) {
        this.reader = new npu.BinaryReader(buffer);
        this.Version = this.reader.getStr(32);
        this.Name = this.reader.getStr(32);
        this.Layer_num = this.reader.getInt32(false);
        this.StartLayer = this.reader.getInt32(false);
        this.EndLayer = this.reader.getInt32(false);
        this.Hardware_Layer_num = this.reader.getInt32(false);
        this.Hardware_Start_Layer = this.reader.getInt32(false);
        this.Hardware_Exec_Layer = this.reader.getInt32(false);
        this.Hardware_Command_Base_Addr = this.reader.getInt32(false);
        this.Hardware_Command_Reg_Addr = this.reader.getInt32(false);
        this.Hardware_Command_base_Vaddr = this.reader.getInt64(false);

        console.log('Version:' + this.Version.split('#').shift().trim());
        console.log('Name:'+this.Name);
        console.log(this.Layer_num + ' layers, ' + this.Hardware_Layer_num + ' hardware layers.');
        console.log('StartLayer: ' + this.StartLayer + ' EndLayer: ' + this.EndLayer);
        console.log('Hardware_Layer_num: ' + this.Hardware_Start_Layer + ' Hardware_Exec_Layer: ' + this.Hardware_Exec_Layer);
        console.log('HwCmdBaseAddr: ' + this.Hardware_Command_Base_Addr.toString(16) + ' HwCmdRegAddr:'+
            this.Hardware_Command_Reg_Addr.toString(16) + ' HwCmdBaseVaddr:' + this.Hardware_Command_base_Vaddr.toString(16));
    }

    getLayer(metadata) {
        const data_length = 96;
        const longest_param = 28;//24;
        var node = new npu.Node(metadata);
        var in_num = this.reader.getInt32(false);
        var out_num = this.reader.getInt32(false);
        this.reader.skip(8);

        var inputs = [];
        var outputs = [];
        for (let i = 1; i <= 4; i++) {
            if (i <= in_num) {
                const blob_reader = new npu.BlobReader768v8(this.reader)
                inputs.push(blob_reader.getBlob());
            } else {
                inputs.push(null);
                this.reader.skip(data_length);
            }
        }

        for (let o = 1; o <= 2; o++) {
            if (o <= out_num) {
                const blob_reader = new npu.BlobReader768v8(this.reader)
                outputs.push(blob_reader.getBlob());
            } else {
                outputs.push(null);
                this.reader.skip(data_length);
            }
        }

        node.name = this.reader.getStr(32);
        var opera_code = this.reader.getInt32(false);

        var Round = new npu.Attribute(null, null);
        Round.name = 'Round';
        Round.type = 'uint32';
        Round.value = this.reader.getInt32(false);
        node.append_attributes(Round);

        if ((opera_code & 0x2) && (opera_code != 0x2)) {
            opera_code = opera_code & ~(opera_code & 0x2)
            var ReluThres = new npu.Attribute(null, null);
            ReluThres.name = 'ReluThres';
            ReluThres.type = 'float32';
            ReluThres.value = this.reader.getFloat32();
            node.append_attributes(ReluThres);
            this.reader.skip(8); // f32PReluNegK s32PrePReluOutShift
        } else if ((opera_code & 0x100) && (opera_code != 0x100)) {
            opera_code = opera_code & ~(opera_code & 0x100)
            this.reader.skip(4); // f32ReluxThres
            var PReluNegK = new npu.Attribute(null, null);
            PReluNegK.name = 'PReluNegK';
            PReluNegK.type = 'float32';
            PReluNegK.value = this.reader.getFloat32();
            node.append_attributes(PReluNegK);

            var PrePReluOutShift =  new npu.Attribute(null, null);
            PrePReluOutShift.name = 'PrePReluOutShift';
            PrePReluOutShift.type = 'int32';
            PrePReluOutShift.value = this.reader.getInt32(true);
            node.append_attributes(PrePReluOutShift);
        } else {
            this.reader.skip(12);// f32ReluxThres f32PReluNegK s32PrePReluOutShift
        }
        node.type = metadata.operator(opera_code);

        const meta_input_blobs = metadata.type(node.type).inputs;
        for (const meta_input_blob of meta_input_blobs) {
            var blob = inputs.shift();
            if (blob !== null) {
    			var blob_arg = new npu.Argument(blob.id.toString(), meta_input_blob.name, blob);
                node.append_inputs(new npu.Parameter(meta_input_blob.name, true, [blob_arg]));
            }
        }

        const meta_output_blobs = metadata.type(node.type).outputs;
        for (const meta_output_blob of meta_output_blobs) {
            var blob = outputs.shift();
            if (blob !== null) {
    			var blob_arg = new npu.Argument(blob.id.toString(), meta_output_blob.name, blob);
                node.append_outputs(new npu.Parameter(meta_output_blob.name, true, [blob_arg]));
            }
        }

        const schema = metadata.type(node.type);
        const attributeMetadata = schema && schema.attributes ? schema && schema.attributes : [];
        var current_param_length = 0;
        for (const attribute of attributeMetadata) {
        	node.append_attributes(new npu.Attribute(attribute, this.reader));
            switch (attribute.type) {
                case 'uint16':
                case 'int16':
                    current_param_length = current_param_length + 2;
                    break;
                case 'uint32':
                case 'int32':
                case 'float32':
                    current_param_length = current_param_length + 4;
                    break;
            }
        }
        this.reader.skip(longest_param - current_param_length);

        return node;
    }
};

npu.BinaryParamReader = class {

    constructor(metadata, buffer) {
        const reader = new npu.BinaryReader(buffer);
        if (reader.getInt32() !== 0x007685DD) {
            throw new npu.Error('Invalid signature.');
        }
        const layerCount = reader.getInt32();
        /* const blobCount = */ reader.getInt32();
        const layers = [];
        for (let i = 0; i < layerCount; i++) {
            const typeIndex = reader.getInt32();
            const operator = metadata.operator(typeIndex);
            const layer = {
                type: operator || typeIndex.toString(),
                name: i.toString(),
                inputs: [],
                outputs: [],
                attr: {},
                attributes: []
            };
            const inputCount = reader.getInt32();
            const outputCount = reader.getInt32();
            for (let j = 0; j < inputCount; j++) {
                layer.inputs.push(reader.getInt32().toString());
            }
            for (let j = 0; j < outputCount; j++) {
                layer.outputs.push(reader.getInt32().toString());
            }
            let id = reader.getInt32();
            while (id != -233) {
                let isArray = id <= -23300;
                if (isArray) {
                    id = -id - 23300;
                }
                if (isArray) {
                    const len = reader.getInt32();
                    const values = [];
                    for (let i = 0; i < len; i++) {
                        values.push(reader.getInt32());
                    }
                    layer.attributes.push({ key: id.toString(), value: values.toString() });
                    layer.attr[id.toString()] = values;
                }
                else {
                    const value = reader.getInt32();
                    layer.attributes.push({ key: id.toString(), value: value.toString() });
                    layer.attr[id.toString()] = value.toString();
                }
                id = reader.getInt32();
            }
            layers.push(layer);
        }
        this._layers = layers;
    }

    get layers() {
        return this._layers;
    }
};

npu.BlobReader718v4 = class {

    constructor(buffer) {
        this._buffer = buffer;
        this._name = '';
    }

    getBlob() {
        var addr = this._buffer.getInt32(false);
        var h = this._buffer.getInt32(false);
        var w = this._buffer.getInt32(false);
        var c = this._buffer.getInt32(false);
        var BitWidth = this._buffer.getInt32(false);
        var ShiftBits = this._buffer.getInt32(true);
        var PadMode = this._buffer.getInt32(false);
        var PadTop = this._buffer.getInt32(false);
        var PadBottom = this._buffer.getInt32(false);
        var PadLeft = this._buffer.getInt32(false);
        var PadRight = this._buffer.getInt32(false);
        var Align = this._buffer.getInt32(false);
        var BufId = this._buffer.getInt32(false);
        var FileOffset = this._buffer.getInt32(false);
        var Offset = this._buffer.getInt32(false);
        var InOutFlag = this._buffer.getInt32(false);
        this._buffer.skip(4);
        var BufSize = this._buffer.getInt32(false);
        this._buffer.skip(4*6);

        var data_type = '';
        switch (BitWidth) {
            case 0:
                data_type = 'NPU_S8BIT';
                break;
            case 1:
                data_type = 'NPU_U8BIT';
                break;
            case 2:
                data_type = 'NPU_S16BIT';
                break;
            case 3:
                data_type = 'NPU_U16BIT';
                break;
        }
        data_type = data_type + ', ShiftBit: ' + ShiftBits;

        return new npu.Tensor(BufId, new npu.TensorType(data_type, new npu.TensorShape([c,h,w])), null);
    }
};

npu.BlobReader768v8 = class {

    constructor(buffer) {
        this._buffer = buffer;
        this._name = '';
    }

    getBlob() {
        var n = this._buffer.getInt16(false);
        var c = this._buffer.getInt16(false);
        var h = this._buffer.getInt16(false);
        var w = this._buffer.getInt16(false);
        var PadType = this._buffer.getInt16(false);
        var PadTop = this._buffer.getInt16(false);
        var PadBottom = this._buffer.getInt16(false);
        var PadLeft = this._buffer.getInt16(false);
        var PadRight = this._buffer.getInt16(false);
        var MaxPadTop = this._buffer.getInt16(false);
        var MaxPadBottom = this._buffer.getInt16(false);
        var BitWidth = this._buffer.getInt16(false);
        var Transposed = this._buffer.getInt16(false);
        var Align = this._buffer.getInt16(false);
        this._buffer.skip(16);
        var ShiftBits = this._buffer.getInt32(true);
        var Scale = this._buffer.getFloat32();
        var Stride = this._buffer.getInt32(false);
        var BufId = this._buffer.getInt32(false);
        var FileOffset = this._buffer.getInt32(false);
        var Offset = this._buffer.getInt32(false);
        var InOutFlag = this._buffer.getInt32(false);
        var BufSize = this._buffer.getInt32(false);
        this._buffer.skip(20);

        var data_type = '';
        switch (BitWidth) {
            case 0:
                data_type = 'NPU_S8BIT';
                break;
            case 1:
                data_type = 'NPU_U8BIT';
                break;
            case 2:
                data_type = 'NPU_S16BIT';
                break;
            case 3:
                data_type = 'NPU_U16BIT';
                break;
        }
        data_type = data_type + ', ShiftBit: ' + ShiftBits;

        return new npu.Tensor(BufId, new npu.TensorType(data_type, new npu.TensorShape([n,c,h,w])), null);
    }
};

DataView.prototype.getString = function(offset, length) {
    var end = typeof length == 'number' ? offset + length : this.byteLength;
    var text = '';
    var val = -1;

    while (offset < this.byteLength && offset < end) {
        val = this.getUint8(offset++);
        if (val == 0) break;
        text += String.fromCharCode(val);
    }

    return text;
};

npu.BinaryReader = class {

    constructor(buffer) {
        this._buffer = buffer;
        this._dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        this._position = 0;
    }

    skip(size) {
        this._position += size;
        if (this._position > this._buffer.length) {
            throw new npu.Error('Expected ' + (this._position - this._buffer.length) + ' more bytes. The file might be corrupted. Unexpected end of file.');
        }
    }

    back(size) {
        this._position = this._position - size;
        if (this._position < 0) {
            throw new npu.Error('Expected ' + this._position + ' bytes out of file. The file might be corrupted. Unexpected end of file.');
        }
    }

    getBit16(mask) {
        this.skip(2);
        this._dataView.set
        var ret = this._dataView.getInt16(this._position, true) | mask;
        this.back(2);

        return ret;
    }

    getBit32(mask) {
        this.skip(4);
        this._dataView.set
        var ret = this._dataView.getInt32(this._position, true) | mask;
        this.back(4);

        return ret;
    }

    getInt16(signed) {
        const position = this._position;
        this.skip(2);
        this._dataView.set
        if (signed) {
            return this._dataView.getInt16(position, true);
        } else{
            return this._dataView.getUint16(position, true);
        }
    }

    getInt32(signed) {
        const position = this._position;
        this.skip(4);
        this._dataView.set
        if (signed) {
            return this._dataView.getInt32(position, true);
        } else{
            return this._dataView.getUint32(position, true);
        }
    }

    getInt64(signed) {
        const position = this._position;
        this.skip(8);
        this._dataView.set
        if (signed) {
            return this._dataView.getBigInt64(position, true);
        } else {
            return this._dataView.getBigUint64(position, true);
        }
    }

    getFloat32() {
        const position = this._position;
        this.skip(4);
        this._dataView.set
        return this._dataView.getFloat32(position, true);
    }

    getStr(len) {
        const position = this._position;
        this.skip(len);
        this._dataView.set
        return this._dataView.getString(position);
    }
};

npu.Error = class extends Error {

    constructor(message) {
        super(message);
        this.name = 'Error loading npu model.';
    }
};

if (typeof module !== 'undefined' && typeof module.exports === 'object') {
    module.exports.ModelFactory = npu.ModelFactory;
}
