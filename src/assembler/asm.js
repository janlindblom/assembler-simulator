app.service('assembler', ['opcodes', function(opcodes) {
    return {
        go: function(input) {
            var self = this;

            // Use https://www.debuggex.com/
            // Matches: "label: INSTRUCTION (["')OPERAND1(]"'), (["')OPERAND2(]"')
            // GROUPS:      1       2            3                 4
            var regex = /^[\t ]*(?:([.A-Za-z]\w*)[:])?(?:[\t ]*([A-Za-z]{2,4})(?:[\t ]+(\[\w+\]|\".+?\"|\'.+?\'|[.A-Za-z0-9]\w*)(?:[\t ]*[,][\t ]*(\[\w+\]|\".+?\"|\'.+?\'|[.A-Za-z0-9]\w*))?)?)?/;
            // MATCHES: "(+|-)INTEGER"
            var regexNum = /^[-+]?[0-9]+$/;
            // MATCHES: "(.L)abel"
            var regexLabel = /^[.A-Za-z]\w*$/;

            var code = [];
            var labels = {};
            var lines = input.split('\n'); // Split text into code lines

            // Allowed formats: 200, 200d, 0xA4, 0o48, 101b
            var parseNumber = function(input) {
                if (input.slice(0,2) === "0x") {
                    return parseInt(input.slice(2), 16);
                } else if (input.slice(0,2) === "0o") {
                    return parseInt(input.slice(2), 8);
                } else if (input.slice(input.length-1) === "b") {
                    return parseInt(input.slice(0, input.length-1), 2);
                } else if (input.slice(input.length-1) === "d") {
                    return parseInt(input.slice(0, input.length-1), 10);
                } else if (regexNum.exec(input)) {
                    return parseInt(input, 10);
                } else {
                    throw "Invalid number format";
                }
            };
            // Allowed registers: A, B, C, D
            var parseRegister = function(input) {
                input = input.toUpperCase();

                if (input === 'A') {
                    return 0;
                } else if (input === 'B') {
                    return 1;
                } else if (input === 'C') {
                    return 2;
                } else if (input === 'D') {
                    return 3;
                } else {
                    return undefined;
                }
            };
            // Allowed: Register, Label or Number
            var parseRegOrNumber = function(input, typeReg, typeNumber) {
                var register = parseRegister(input);

                if (register !== undefined) {
                    return { type: typeReg, value: register};
                } else {
                    var label = parseLabel(input);
                    if (label !== undefined) {
                        return { type: typeNumber, value: label};
                    } else {
                        var value = parseNumber(input);

                        if (isNaN(value)) {
                            throw "Not a " + typeNumber + ": " + value;
                        }
                        else if (value < 0 || value > 255)
                            throw typeNumber + " must have a value between 0-255";

                        return { type: typeNumber, value: value};
                    }
                }
            };
            // Allowed: Label
            var parseLabel = function(input) {
                if (regexLabel.exec(input)) {
                    return input.toUpperCase();
                } else {
                    return undefined;
                }
            };
            var getValue = function(input) {
                switch(input.slice(0,1)) {
                    case '[': // [number] or [register]
                        var address = input.slice(1,input.length-1);
                        return parseRegOrNumber(address, "regaddress", "address");
                    case '"': // "String"
                        var text = input.slice(1,input.length-1);
                        var chars = [];

                        for (var i = 0, l = text.length; i < l; i++) {
                            chars.push(text.charCodeAt(i));
                        }

                        return { type: "numbers", value: chars };
                    case "'": // 'C'
                        var character = input.slice(1,input.length-1);
                        if (character.length > 1)
                            throw "Only one character is allowed. Use String instead";

                        return { type: "number", value: character.charCodeAt(0) };
                    default: // REGISTER, NUMBER or LABEL
                        return parseRegOrNumber(input, "register", "number");
                }
            };
            var addLabel = function(label) {
                label = label.toUpperCase();
                if (label in labels)
                    throw "Duplicate label: " + label;

                if (label === "A" || label === "B" || label === "C" || label === "D")
                    throw "Label contains keyword: " + label;

                labels[label] = code.length;
            };

            for(var i = 0, l = lines.length; i < l; i++) {
                try {
                    var match = regex.exec(lines[i]);
                    if (match[1] !== undefined || match[2] !== undefined) {
                        if (match[1] !== undefined) {
                            addLabel(match[1]);
                        }

                        if (match[2] !== undefined) {
                            var instr = match[2].toUpperCase();
                            var p1, p2, opCode;

                            switch(instr) {
                                case 'DB':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "number")
                                        code.push(p1.value);
                                    else if (p1.type === "numbers")
                                        for (var j = 0, k = p1.value.length; j < k; j++) {
                                            code.push(p1.value[j]);
                                        }
                                    else
                                        throw "DB does not support this operand";

                                    break;
                                case 'MOV':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);
                                    
                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.MOV_REG_TO_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.MOV_ADDRESS_TO_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.MOV_REGADDRESS_TO_REG;
                                    else if (p1.type === "address" && p2.type === "register")
                                        opCode = opcodes.MOV_REG_TO_ADDRESS;
                                    else if (p1.type === "regaddress" && p2.type === "register")
                                        opCode = opcodes.MOV_REG_TO_REGADDRESS;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.MOV_NUMBER_TO_REG;
                                    else if (p1.type === "address" && p2.type === "number")
                                        opCode = opcodes.MOV_NUMBER_TO_ADDRESS;
                                    else if (p1.type === "regaddress" && p2.type === "number")
                                        opCode = opcodes.MOV_NUMBER_TO_REGADDRESS;
                                    else
                                        throw "MOV does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'ADD':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.ADD_REG_TO_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.ADD_REGADDRESS_TO_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.ADD_ADDRESS_TO_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.ADD_NUMBER_TO_REG;
                                    else
                                        throw "ADD does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'SUB':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.SUB_REG_FROM_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.SUB_REGADDRESS_FROM_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.SUB_ADDRESS_FROM_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.SUB_NUMBER_FROM_REG;
                                    else
                                        throw "SUB does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'INC':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.INC_REG;
                                    else
                                        throw "INC does not support this operand";

                                    code.push(opCode, p1.value);

                                    break;
                                case 'DEC':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.DEC_REG;
                                    else
                                        throw "DEC does not support this operand";

                                    code.push(opCode, p1.value);

                                    break;
                                case 'CMP':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.CMP_REG_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.CMP_REGADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.CMP_ADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.CMP_NUMBER_WITH_REG;
                                    else
                                        throw "CMP does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'JMP':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.JMP_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.JMP_ADDRESS;
                                    else
                                        throw "JMP does not support this operands";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'JC':case 'JB':case 'JNAE':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.JC_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.JC_ADDRESS;
                                    else
                                        throw instr + " does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'JNC':case 'JNB':case 'JAE':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.JNC_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.JNC_ADDRESS;
                                    else
                                        throw instr + "does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'JZ': case 'JE':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.JZ_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.JZ_ADDRESS;
                                    else
                                        throw instr + " does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'JNZ': case 'JNE':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.JNZ_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.JNZ_ADDRESS;
                                    else
                                        throw instr + " does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'JA': case 'JNBE':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.JA_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.JA_ADDRESS;
                                    else
                                        throw instr + " does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'JNA': case 'JBE':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.JNA_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.JNA_ADDRESS;
                                    else
                                        throw instr + " does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'PUSH':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.PUSH_REG;
                                    else if (p1.type === "regaddress")
                                        opCode = opcodes.PUSH_REGADDRESS;
                                    else if (p1.type === "address")
                                        opCode = opcodes.PUSH_ADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.PUSH_NUMBER;
                                    else
                                        throw "PUSH does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'POP':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.POP_REG;
                                    else
                                        throw "PUSH does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'CALL':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.CALL_REGADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.CALL_ADDRESS;
                                    else
                                        throw "CALL does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'RET':
                                    opCode = opcodes.RET;
                                    code.push(opCode);
                                    break;
                                case 'MUL':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.MUL_REG;
                                    else if (p1.type === "regaddress")
                                        opCode = opcodes.MUL_REGADDRESS;
                                    else if (p1.type === "address")
                                        opCode = opcodes.MUL_ADDRESS;
                                    else if (p1.type === "number")
                                        opCode = opcodes.MUL_NUMBER;
                                    else
                                        throw "MULL does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'DIV':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.DIV_REG;
                                    if (p1.type === "regaddress")
                                        opCode = opcodes.DIV_REGADDRESS;
                                    if (p1.type === "address")
                                        opCode = opcodes.DIV_ADDRESS;
                                    if (p1.type === "number")
                                        opCode = opcodes.DIV_NUMBER;
                                    else
                                        throw "DIV does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'AND':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.AND_REG_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.AND_REGADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.AND_ADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.AND_NUMBER_WITH_REG;
                                    else
                                        throw "AND does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'OR':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.OR_REG_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.OR_REGADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.OR_ADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.OR_NUMBER_WITH_REG;
                                    else
                                        throw "OR does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'XOR':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.XOR_REG_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.XOR_REGADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.XOR_ADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.XOR_NUMBER_WITH_REG;
                                    else
                                        throw "XOR does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'NOT':
                                    p1 = getValue(match[3]);

                                    if (p1.type === "register")
                                        opCode = opcodes.NOT_REG;
                                    else
                                        throw "NOT does not support this operand";

                                    code.push(opCode, p1.value);
                                    break;
                                case 'SHL':case 'SAL':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.SHL_REG_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.SHL_REGADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.SHL_ADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.SHL_NUMBER_WITH_REG;
                                    else
                                        throw instr + " does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                case 'SHR': case 'SAR':
                                    p1 = getValue(match[3]);
                                    p2 = getValue(match[4]);

                                    if (p1.type === "register" && p2.type === "register")
                                        opCode = opcodes.SHR_REG_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "regaddress")
                                        opCode = opcodes.SHR_REGADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "address")
                                        opCode = opcodes.SHR_ADDRESS_WITH_REG;
                                    else if (p1.type === "register" && p2.type === "number")
                                        opCode = opcodes.SHR_NUMBER_WITH_REG;
                                    else
                                        throw instr + " does not support this operands";

                                    code.push(opCode, p1.value, p2.value);
                                    break;
                                default:
                                    throw "Invalid instruction: " + match[2];
                            }
                        }
                    } else {
                        // Check if line starts with a comment otherwise the line contains an error and can not be parsed
                        var line = lines[i].trim();
                        if (line !== "" && line.slice(0,1) !== ";") {
                            throw "Syntax error";
                        }
                    }
                } catch(e) {
                    throw { error: e, line: i};
                }
            }

            // Replace label
            for(i = 0, l = code.length; i < l; i++) {
                if (!angular.isNumber(code[i])) {
                    if (code[i] in labels) {
                        code[i] = labels[code[i]];
                    } else {

                        throw { error: "Undefined label: " + code[i] };
                    }
                }
            }

            return code;
        }
    };
}]);