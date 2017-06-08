const mathjs = require("mathjs");
const StepperDrive = require("./StepperDrive");
const Factory = require("./Factory");
const Variable = require("./Variable");
const Example = require("./Example");
const Network = require("./Network");
const winston = require("winston");

(function(exports) {
    class DriveFrame {
        constructor (drives, options={}) {
            this.type = "DriveFrame";
            this.drives = drives;
            var driveNames = ["X","Y","Z","A","B","C"];
            this.drives.forEach((drive,i) => {
                if (drive.name == null) {
                    drive.name = i < driveNames.length ? driveNames[i] : ("Drive" + (i+1));
                }
            });
            this.backlash = options.backlash == null || options.backlash;
            this.deadbandScale = options.deadbandScale || 3; // provides continuous yet quick transition across deadband
            this.deadbandHome = options.deadbandHome || 0.5; // default is homing to minPos with backoff exceeding positive deadband

            Object.defineProperty(this, "deadband", {
                enumerable: true,
                get: () => this.state.slice(this.drives.length, 2*this.drives.length).map((p) => p),
                set: (deadband) => {throw new Error("attempt to set read-only property: deadband")},
            });
            Object.defineProperty(this, "axisPos", {
                enumerable: true,
                get: () => this.state.slice(0, this.drives.length),
                set: (axisPos) => {
                    if (!(axisPos instanceof Array) || axisPos.length !== this.drives.length) {
                        throw new Error("Expected array of length:"+this.drives.length + " axisPos:"+JSON.stringify(axisPos));
                    }
                    var newpos = axisPos.map((p,i) => {
                        var di = this.drives[i];
                        var pos = DriveFrame.clipPosition(p, di.minPos, di.maxPos);
                        var deadbandOld = this.$state[i+this.drives.length];
                        if (this.state[i] === pos) {
                            var deadbandNew = deadbandOld;
                        } else if (pos === di.minPos) {
                            var deadbandNew = this.deadbandHome; // homing to minPos
                        } else {
                            var posDelta = pos - this.state[i];
                            var deadbandNew = mathjs.tanh(this.deadbandScale*posDelta);
                            deadbandNew = mathjs.min(0.5,mathjs.max(deadbandOld+deadbandNew,-0.5));
                        }
                        this.$state[i+this.drives.length] = deadbandNew;
                        this.$state[i] = pos;
                        return pos;
                    });
                    return newpos;
                },
            });
            Object.defineProperty(this, "state", {
                enumerable: true,
                get: () => this.$state.map((s) => s),
                set: (state) => ((this.$state = state.map((s) => s)), state),
            });
            Object.defineProperty(this, "outputTransform", {
                value: options.outputTransform || 
                    ((frame) => frame.state.slice(0, frame.drives.length)),
            });
            Object.defineProperty(this, "output", {
                get: () => this.outputTransform(this),
            });
            options.state && (this.state = options.state) || this.clearPos();
        }

        static fromJSON(json) {
            json = typeof json === "string" ? JSON.parse(json) : json;
            var drives = json.drives.map((d) => StepperDrive.fromJSON(d));
            var frame = new DriveFrame(drives, json);
            json.calibration && (frame.calibration = Network.fromJSON(json.calibration));
            return frame;
        }

        static clipPosition(value, min, max) {
            // Javascript min/max coerce null to zero. UGH!
            return value == null ? null : Math.min(Math.max(min,value), max);
        }

        toJSON() {
            var obj = {
                type: "DriveFrame",
                state: this.state,
                axisPos: this.axisPos,
                backlash: this.backlash,
                deadbandScale: this.deadbandScale,
                drives: this.drives.map((d) => d.toJSON()),
                calibration: this.calibration,
            }
            return obj;
        }

        clearPos() {
            this.state = (
                this.drives.map((d) => null)
                .concat(this.drives.map((d) => this.deadbandHome))
            );
        }

        home(options = {}) {
            if (options.axis != null) {
                winston.debug("home axis", options.axis);
                var drive = this.drives[options.axis];
                if (drive == null) { throw new Error("home() invalid axis:"+options.axis); }
                var oldPos = this.axisPos;
                this.axisPos = oldPos.map((p, i) => i===options.axis ? this.drives[i].minPos : p);
            } else {
                winston.debug("home all");
                this.axisPos = this.drives.map((d) => d.minPos);
            }
            return this;
        }

        moveTo(axisPos) {
            var oldPos = this.axisPos;
            this.axisPos = axisPos.map((p,i) => p == null ? oldPos[i] : p);
            return this;
        }

        calibrationExamples(nExamples=30, options={}) {
            var vars = this.variables().slice(0, this.drives.length);
            var measuredPos = options.measuredPos || ((pos) => pos);
            var targetState = options.targetState || 
                ((state) => Object.assign([],state,measuredPos(this.axisPos)));
            var separation = options.separation || 1; // stay out of deadband
            return Array(nExamples).fill().map((na,iEx) => {
                if (iEx === 0) {
                    this.axisPos = this.drives.map((d) => d.minPos);
                } else {
                    do {
                        var axisPos = vars.map((v) => v.sample());
                        var distance = mathjs.min(mathjs.abs(mathjs.subtract(axisPos,this.axisPos)));
                    } while(distance < separation);
                    this.axisPos = axisPos;
                }
                return new Example(this.state, targetState(this.state) 
                );
            });
        }

        toAxisPos(motorPos) {
            return motorPos.map((m,i) => this.drives[i].toAxisPos(m));
        }

        toMotorPos(axisPos) {
            return axisPos.map((a,i) => this.drives[i].toMotorPos(a));
        }

        variables() {
            var vars = this.drives.map( (d) => new Variable([d.minPos, d.maxPos]) )
            if (this.backlash) {
                var deadbandVars = this.drives.map( (d) => new Variable([-0.5,0.5]) )
                vars = vars.concat(deadbandVars);
            }
            return vars;
        }

    } // class DriveFrame

    module.exports = exports.DriveFrame = DriveFrame;
})(typeof exports === "object" ? exports : (exports = {}));
