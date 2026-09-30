import React, {useEffect, useRef, useState} from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import mobileAds, {AdsConsent, BannerAd, BannerAdSize, TestIds, RewardedAd, RewardedAdEventType, AdEventType} from 'react-native-google-mobile-ads';
import {api} from './api';

// Test units remain mandatory until the AdMob account and consent messages are configured.
const TEST = process.env.EXPO_PUBLIC_ADS_LIVE !== 'true';
const bannerId = TEST ? TestIds.BANNER : process.env.EXPO_PUBLIC_ADMOB_BANNER_ID;
let initializing;
function initialize() {
  if (!initializing) initializing = (async () => {
    const info = await AdsConsent.gatherConsent();
    if (!info.canRequestAds) throw new Error('Publicités indisponibles selon tes choix de confidentialité.');
    await mobileAds().initialize();
  })().catch(e => {initializing = null; throw e;});
  return initializing;
}
export function AdsPanel({reward = false, onRefresh}) {
  const [ready,setReady] = useState(false);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const cleanup = useRef(() => {});
  const mounted = useRef(true);
  const locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    initialize().then(() => {if(mounted.current)setReady(true);}).catch(() => {if(mounted.current)setMessage('Publicités momentanément indisponibles.');});
    return () => {mounted.current = false; cleanup.current();};
  },[]);
  const watch = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage('Chargement de la publicité…');
    try {
      await initialize();
      const ticket = TEST ? null : await api('/ads/ticket',{});
      if (!mounted.current) return;
      const ad = RewardedAd.createForAdRequest(TEST ? TestIds.REWARDED : ticket.unit, {
        requestNonPersonalizedAdsOnly:true,
        ...(ticket ? {serverSideVerificationOptions:{userId:ticket.userId,customData:ticket.ticket}} : {})
      });
      let earned = false;
      const subs = [];
      const stop = () => {clearTimeout(timer);subs.forEach(fn=>fn());locked.current=false;if(mounted.current)setBusy(false);};
      const timer = setTimeout(() => {stop();if(mounted.current)setMessage('Publicité indisponible. Réessaie plus tard.');},45000);
      cleanup.current = stop;
      subs.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        clearTimeout(timer);
        ad.show().catch(() => {stop();if(mounted.current)setMessage('Impossible d’ouvrir la publicité.');});
      }));
      subs.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {earned=true;}));
      subs.push(ad.addAdEventListener(AdEventType.ERROR, () => {stop();if(mounted.current)setMessage('Aucune publicité disponible actuellement.');}));
      subs.push(ad.addAdEventListener(AdEventType.CLOSED, async () => {
        stop();
        if(!mounted.current)return;
        setMessage(!earned ? 'Publicité interrompue : aucun scan ajouté.' : TEST ? 'Publicité de test terminée. Aucun scan réel ajouté : validation AdMob à configurer.' : 'Publicité terminée : ton scan sera ajouté après confirmation. Appuie sur Actualiser mon solde.');
        if(earned && !TEST) await onRefresh?.().catch(()=>{});
      }));
      ad.load();
    } catch(e) {locked.current=false;if(mounted.current){setBusy(false);setMessage(e.message);}}
  };
  if (!reward) return ready && bannerId ? <View style={{alignItems:'center',paddingVertical:8,backgroundColor:'#101018'}}><Text style={{color:'#92929f',fontSize:10,marginBottom:4}}>{TEST?'PUBLICITÉ DE TEST':'PUBLICITÉ'}</Text><BannerAd unitId={bannerId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={{requestNonPersonalizedAdsOnly:true}} onAdFailedToLoad={()=>setReady(false)} /></View> : null;
  return <View style={{padding:18,borderRadius:18,backgroundColor:'#191923',marginVertical:16,gap:12}}>
    <Text style={{color:'#fff',fontSize:19,fontWeight:'800'}}>Un scan de plus</Text>
    <Text style={{color:'#b5b5c7',lineHeight:21}}>{TEST?'Essaie une publicité de démonstration. Les scans offerts seront activés après la configuration AdMob.':'Regarde une publicité jusqu’au bout pour obtenir 1 scan supplémentaire. C’est facultatif.'}</Text>
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={watch} style={{backgroundColor:'#FBBF24',borderRadius:12,padding:15,opacity:busy?.5:1}}><Text style={{textAlign:'center',fontWeight:'800',color:'#121212'}}>{busy?'Publicité en cours…':TEST?'Tester une publicité':'Voir une pub · +1 scan'}</Text></TouchableOpacity>
    {!!message && <Text accessibilityRole="alert" style={{color:'#d4d4df'}}>{message}</Text>}
    <TouchableOpacity accessibilityRole="button" onPress={()=>AdsConsent.showPrivacyOptionsForm().then(()=>AdsConsent.getConsentInfo()).then(info=>{setReady(info.canRequestAds);}).catch(()=>setMessage('Les options de confidentialité ne sont pas disponibles actuellement.'))}><Text style={{color:'#b5b5c7',textDecorationLine:'underline'}}>Choix de confidentialité publicitaire</Text></TouchableOpacity>
  </View>;
}
