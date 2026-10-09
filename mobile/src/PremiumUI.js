import React from 'react';
import {View, Text, Image, ScrollView, TouchableOpacity, StyleSheet} from 'react-native';
import {C} from './game';

// Small native line icons: no font download or extra native dependency.
export function LineIcon({name, color = C.text, size = 24}) {
  const line = (x,y,w,h,rotation=0,radius=0) => <View key={`${x}-${y}-${w}-${h}`} style={{position:'absolute',left:x,top:y,width:w,height:h,borderWidth:1.6,borderColor:color,borderRadius:radius,transform:[{rotate:`${rotation}deg`}]}} />;
  const shapes = {
    home: [line(5,10,14,11,0,1),line(4,4,10,2,-40),line(11,4,10,2,40),line(10,15,4,6)],
    scan: [line(2,6,20,15,0,3),line(8,3,8,3,0,1),line(8,10,8,8,0,8)],
    garage: [line(2,10,20,9,0,3),line(5,4,14,7,0,3),line(5,18,3,4,0,1),line(16,18,3,4,0,1)],
    challenge: [line(6,2,12,13,0,5),line(2,4,4,7,0,3),line(18,4,4,7,0,3),line(11,15,2,6),line(6,21,12,1)],
    shop: [line(3,8,18,14,0,2),line(8,2,8,9,0,5)],
    account: [line(8,2,8,8,0,8),line(3,13,18,10,0,8)],
    social: [line(8,2,8,8,0,8),line(5,13,14,10,0,6),line(0,10,4,9,0,3),line(20,10,4,9,0,3)],
    check: [line(3,13,8,2,45),line(8,10,15,2,-45)],
  };
  return <View accessible={false} style={{width:size,height:size,alignItems:'center',justifyContent:'center'}}><View style={{width:24,height:24,transform:[{scale:size/24}]}}>{shapes[name] || shapes.scan}</View></View>;
}

export function HomeScreen({player, entitlements, connected, onScan, onAccount, onGarage, renderCard}) {
  const garage = [...(player.garage || [])].sort((a,b)=>b.scannedAt-a.scannedAt);
  return <ScrollView style={s.page} contentContainerStyle={s.content}>
    <Text style={s.greeting}>{connected ? `Bonjour ${player.name}` : 'Bienvenue dans CarDrive'}</Text>
    <Text accessibilityRole="header" style={s.title}>Chaque voiture devient <Text style={{color:C.accent}}>une carte.</Text></Text>
    {garage.length > 0 ? renderCard(garage[0]) : <View style={s.empty}>
      <LineIcon name="garage" size={48} color={C.accent}/>
      <Text style={s.heading}>Ton garage commence ici</Text>
      <Text style={s.copy}>Photographie une voiture, découvre son identité et ajoute-la à ta collection.</Text>
    </View>}
    <TouchableOpacity accessibilityRole="button" onPress={connected ? onScan : onAccount} style={s.primary}>
      <LineIcon name="scan" color={C.bg}/><Text style={s.primaryText}>{connected ? 'Scanner une voiture' : 'Créer un compte / Se connecter'}</Text>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Consulter mon compte et mes scans" onPress={onAccount} style={s.balance}>
      <View style={{flex:1,gap:4}}><Text style={s.heading}>{connected ? entitlements.isPremium ? 'Scans illimités' : `${entitlements.remaining || 0} scans disponibles` : '5 scans gratuits par jour'}</Text>
      <Text style={s.copy}>{connected ? `${entitlements.freeRemaining || 0}/5 gratuits aujourd’hui · ${entitlements.credits || 0} en réserve` : 'Un compte gratuit pour commencer'}</Text></View>
      <Text style={{color:C.accent,fontSize:24}}>›</Text>
    </TouchableOpacity>
    {garage.length > 0 && <>
      <TouchableOpacity accessibilityRole="button" onPress={onGarage} style={s.section}><Text style={s.heading}>Dernières découvertes</Text><Text style={{color:C.accent}}>Voir le garage ›</Text></TouchableOpacity>
      {garage.slice(0,3).map(car=><TouchableOpacity key={car.id} accessibilityRole="button" onPress={onGarage} style={s.discovery}>
        <View style={{width:4,alignSelf:'stretch',backgroundColor:car.rarity.color,borderRadius:2}}/>
        {car.imageUri && <Image source={{uri:car.imageUri}} style={{width:60,height:48,borderRadius:8}}/>}
        <View style={{flex:1}}><Text style={{color:C.text,fontWeight:'700',fontSize:15}}>{car.make} {car.model}</Text><Text style={s.copy}>{car.year}</Text></View><Text style={{color:C.muted}}>›</Text>
      </TouchableOpacity>)}
    </>}
    <Text style={s.note}>Ton garage est conservé sur cet appareil.</Text>
  </ScrollView>;
}
const s = StyleSheet.create({
  page:{flex:1,backgroundColor:C.bg},content:{padding:20,paddingBottom:32,gap:16},
  greeting:{color:C.muted,fontSize:15},title:{color:C.text,fontSize:32,fontWeight:'800',lineHeight:39,letterSpacing:-0.8},
  heading:{color:C.text,fontSize:17,fontWeight:'700'},copy:{color:C.muted,fontSize:13,lineHeight:20},
  empty:{padding:28,gap:16,backgroundColor:C.card,borderColor:C.border,borderWidth:1,borderRadius:20},
  primary:{minHeight:56,padding:16,borderRadius:16,backgroundColor:C.accent,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12},primaryText:{color:C.bg,fontSize:16,fontWeight:'800',flexShrink:1},
  balance:{padding:18,borderRadius:16,borderWidth:1,borderColor:C.border,backgroundColor:C.surface,flexDirection:'row',alignItems:'center',gap:12},
  section:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:8,marginTop:12,minHeight:44},
  discovery:{flexDirection:'row',gap:12,alignItems:'center',padding:14,borderRadius:12,backgroundColor:C.card},
  note:{color:C.muted,fontSize:12,textAlign:'center',marginTop:8},
});
