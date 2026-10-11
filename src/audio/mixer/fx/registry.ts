import type {FxKind} from './spec';
import type {FxFactory} from './types';
import {createLimiter} from './limiter';
import {createCompressor} from './compressor';
import {createDelay} from './delay';
import {createSaturation} from './saturation';
import {createChorus} from './chorus';
import {createPhaser} from './phaser';
import {createFlanger} from './flanger';
import {createFilter} from './filter';
import {createWidener} from './widener';
import {createBitcrusher} from './bitcrusher';
import {createTransient} from './transient';
/** DSP factory of every effect kind. */
export const fxFactories:Record<FxKind,FxFactory>={
 limiter:createLimiter,compressor:createCompressor,delay:createDelay,saturation:createSaturation,chorus:createChorus,phaser:createPhaser,
 flanger:createFlanger,filter:createFilter,widener:createWidener,bitcrusher:createBitcrusher,transient:createTransient
};
