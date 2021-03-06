import {EventEmitter} from 'eventemitter3';
import ChainBuilder from './ChainBuilder';

let id = 0;

// Get the optional shared ticker for
// handling the progress update
// otherwise sound instance don't update
const PIXI:any = (global as any).PIXI;
const sharedTicker:any = PIXI.ticker ? PIXI.ticker.shared : null;

/**
 * A single play instance that handles the AudioBufferSourceNode.
 * @class SoundInstance
 * @memberof PIXI.sound
 * @param {ChainBuilder} source Reference to the ChainBuilder.
 */
export default class SoundInstance extends EventEmitter
{
    /**
     * Recycle instance, because they will be created many times.
     * @type {Array}
     * @name PIXI.sound.SoundInstance._pool
     * @static
     * @private
     */
    static _pool:Array<SoundInstance> = [];

    public id:number;
    private _chain:ChainBuilder;
    private _startTime:number;
    private _paused:boolean;
    private _position:number;
    private _progress:number;
    private _duration:number;
    private _source:any;

    /**
     * Recycle instance, because they will be created many times.
     * @method PIXI.sound.SoundInstance.create
     * @static
     * @private
     */
    public static create(chain:ChainBuilder):SoundInstance
    {
        if (SoundInstance._pool.length > 0)
        {
            let sound = SoundInstance._pool.pop();
            sound._init(chain);
            return sound;
        }
        else
        {
            return new SoundInstance(chain);
        }
    }

    constructor(chain:ChainBuilder)
    {
        super();

        this.id = id++;

        /**
         * The source node chain.
         * @type {ChainBuilder}
         * @name PIXI.sound.SoundInstance#_chain
         * @private
         */
        this._chain = null;

        /**
         * The starting time.
         * @type {int}
         * @name PIXI.sound.SoundInstance#_startTime
         * @private
         */
        this._startTime = 0;

        /**
         * true if paused.
         * @type {Boolean}
         * @name PIXI.sound.SoundInstance#_paused
         * @private
         */
        this._paused = false;

        /**
         * The current position in seconds.
         * @type {int}
         * @name PIXI.sound.SoundInstance#_position
         * @private
         */
        this._position = 0;

        /**
         * Total length of audio in seconds.
         * @type {Number}
         * @name PIXI.sound.SoundInstance#_duration
         * @private
         */
        this._duration = 0;

        /**
         * Progress float from 0 to 1.
         * @type {Number}
         * @name PIXI.sound.SoundInstance#_progress
         * @private
         */
        this._progress = 0;

        // Initialize
        this._init(chain);
    }

    /**
     * Stops the instance, don't use after this.
     * @method PIXI.sound.SoundInstance#stop
     */
    public stop():void
    {
        if (this._source)
        {
            this._internalStop();

            /**
             * The sound is stopped. Don't use after this is called.
             * @event PIXI.sound.SoundInstance#stop
             */
            this.emit('stop');
        }
    }

    /**
     * Plays the sound.
     * @method PIXI.sound.SoundInstance#play
     * @param {Number} [offset=0] Number of seconds to offset playing.
     */
    public play(offset:number = 0):void
    {
        this._progress = 0;
        this._paused = false;
        this._position = offset;
        this._source = this._chain.cloneBufferSource();
        this._duration = this._source.buffer.duration;
        this._startTime = performance.now();
        this._source.onended = this._onComplete.bind(this);
        this._source.start(0, offset);

        /**
         * The sound is started.
         * @event PIXI.sound.SoundInstance#start
         */
        this.emit('start');

        /**
         * The sound progress is updated.
         * @event PIXI.sound.SoundInstance#progress
         * @param {Number} progress Amount progressed from 0 to 1
         */
        this.emit('progress', 0);

        if (sharedTicker)
        {
            sharedTicker.add(this._update, this);
        }
    }

    /**
     * The current playback progress from 0 to 1.
     * @type {Number}
     * @name PIXI.sound.SoundInstance#progress
     */
    public get progress():number
    {
        return this._progress;
    }

    /**
     * Pauses the sound.
     * @type {Boolean}
     * @name PIXI.sound.SoundInstance#paused
     */
    public get paused():boolean
    {
        return this._paused;
    }

    public set paused(paused:boolean)
    {
        if (paused !== this._paused)
        {
            this._paused = paused;

            if (paused)
            {
                // pause the sounds
                this._internalStop();
                this._position = (performance.now() - this._startTime) / 1000;
                /**
                 * The sound is paused.
                 * @event PIXI.sound.SoundInstance#paused
                 */
                this.emit('paused');
            }
            else
            {
                /**
                 * The sound is unpaused.
                 * @event PIXI.sound.SoundInstance#resumed
                 */
                this.emit('resumed');
                // resume the playing with offset
                this.play(this._position);
            }

            /**
             * The sound is paused or unpaused.
             * @event PIXI.sound.SoundInstance#pause
             * @param {Boolean} paused If the instance was paused or not.
             */
            this.emit('pause', paused);
        }
    }
    
    /**
     * Don't use after this.
     * @method PIXI.sound.SoundInstance#destroy
     */
    public destroy():void
    {
        this.removeAllListeners();
        this._internalStop();
        if (this._source)
        {
            this._source.onended = null;
        }
        this._source = null;
        this._chain = null;
        this._startTime = 0;
        this._paused = false;
        this._position = 0;
        this._duration = 0;

        // Add it if it isn't already added
        if (SoundInstance._pool.indexOf(this) < 0)
        {
            SoundInstance._pool.push(this);
        }
    }

    /**
     * To string method for instance.
     * @method PIXI.sound.SoundInstance#toString
     * @return {String} The string representation of instance.
     * @private
     */
    public toString():string
    {
        return '[SoundInstance id=' + this.id + ']';
    }

    /**
     * Internal update the progress. This only run's
     * if the PIXI shared ticker is available.
     * @method PIXI.sound.SoundInstance#_update
     * @private
     */
    private _update(): void
    {
        if (this._duration)
        {
            const position = this._paused ? 
                this._position :
                (performance.now() - this._startTime) / 1000;
            this._progress = Math.max(0, Math.min(1, position / this._duration));
            this.emit('progress', this._progress);
        }
    }

    /**
     * Initializes the instance.
     * @method PIXI.sound.SoundInstance#init
     * @private
     */
    private _init(chain:ChainBuilder):void
    {
        this._chain = chain;
    }

    /**
     * Stops the instance.
     * @method PIXI.sound.SoundInstance#_internalStop
     * @private
     */
    private _internalStop():void
    {
        if (this._source)
        {
            if (sharedTicker)
            {
                sharedTicker.remove(this._update, this);
            }
            this._source.onended = null;
            this._source.stop();
            this._source = null;

        }
    }

    /**
     * Callback when completed.
     * @method PIXI.sound.SoundInstance#_onComplete
     * @private
     */
    private _onComplete():void
    {
        if (this._source)
        {
            this._source.onended = null;
        }
        this._source = null;
        this._progress = 1;
        this.emit('progress', 1);
        /**
         * The sound ends, don't use after this
         * @event PIXI.sound.SoundInstance#end
         */
        this.emit('end', this);
    }
}
