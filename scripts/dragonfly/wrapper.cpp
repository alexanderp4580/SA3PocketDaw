#include "DistrhoPluginInfo.h"
#include "DSP.hpp"
#include <cstdio>
#include <cstdlib>
// Stable libc RNG adapter: identical noise modulation in native and WASM verification.
#ifdef __EMSCRIPTEN__
#define RAND_NOEXCEPT
#else
#define RAND_NOEXCEPT noexcept
#endif
extern "C" int rand() RAND_NOEXCEPT {static uint32_t state=0x51a3d123;state^=state<<13;state^=state>>17;state^=state<<5;return static_cast<int>(state&0x7fffffff);}
struct Instance { DragonflyReverbDSP dsp; float buffers[4][128]{}; Instance(double sr):dsp(sr){} };
extern "C" {
Instance* dr_create(double sr){return new Instance(sr);}
void dr_destroy(Instance* p){delete p;}
float* dr_buffer(Instance*p,int channel){return p->buffers[channel];}
void dr_param(Instance*p,int index,float value){p->dsp.setParameterValue(index,value);}
void dr_mute(Instance*p){p->dsp.mute();}
void dr_process(Instance*p,int count){const float*in[2]={p->buffers[0],p->buffers[1]};float*out[2]={p->buffers[2],p->buffers[3]};p->dsp.run(in,out,count);}
}
#ifdef NATIVE_VERIFY
int main(){auto p=dr_create(48000);dr_param(p,0,0);
#ifdef PLATE
 dr_param(p,1,100);
#else
 dr_param(p,1,30);dr_param(p,paramLate,70);
#endif
 for(int b=0;b<750;b++){for(int c=0;c<2;c++)for(int i=0;i<128;i++)p->buffers[c][i]=0;if(!b)p->buffers[0][0]=1;dr_process(p,128);for(int i=0;i<128;i++){fwrite(&p->buffers[2][i],4,1,stdout);fwrite(&p->buffers[3][i],4,1,stdout);}}dr_destroy(p);}
#endif
