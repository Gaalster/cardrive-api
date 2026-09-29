import { keepPhoto } from "./src/photos";
import { DEMO_MODE } from "./src/config";
/**
 * CarDrive TCG — App.js (React Native / Expo)
 * Interface du jeu. Paiements et reconnaissance passent par le serveur.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
  Dimensions,
  StatusBar,
  Platform,
  Modal,
  AppState,
  Linking,
  Alert,
} from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { ShopScreen } from "./src/ShopScreen";
import { api } from "./src/api";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";
import {
  C,
  RARITIES,
  computeRarity,
  CHALLENGES,
  FREQ_LABEL,
  FREQ_COLOR,
  getPeriodStart,
  getTimeLeft,
  isStillLocked,
  carMatchesChallenge,
  MAX_FUEL,
  garageScore,
  bonusScore,
  totalScore,
  uid,
} from "./src/game";
import {
  db,
  syncToFirebase,
  fetchLeaderboard,
  searchPlayerByName,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  fetchPlayerById,
  loadPlayer,
  savePlayer,
} from "./src/playerStore";

const { width: W } = Dimensions.get("window");

// La clé IA reste sur le serveur ; les quotas y sont vérifiés.
async function recognizeCar(base64, mediaType = "image/jpeg") {
  return api("/recognize", { base64, mediaType });
}

/* ══════════════════════════════════════════════════
   ATOMS
══════════════════════════════════════════════════ */
function Stars({ n, color, size = 13 }) {
  return (
    <View style={{ flexDirection: "row" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text
          key={i}
          style={{ fontSize: size, color: i <= n ? color : "#1e1e30" }}
        >
          ★
        </Text>
      ))}
    </View>
  );
}

function RarityBadge({ rarity: r }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 20,
        backgroundColor: r.color + "22",
        borderWidth: 1,
        borderColor: r.color + "55",
      }}
    >
      <Text
        style={{
          fontSize: 8,
          fontWeight: "800",
          color: r.color,
          letterSpacing: 1,
        }}
      >
        {r.emoji} {r.label.toUpperCase()}
      </Text>
    </View>
  );
}

function Btn({
  label,
  onPress,
  color = C.accent,
  outline = false,
  flex,
  disabled = false,
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          paddingVertical: 13,
          paddingHorizontal: 18,
          borderRadius: 14,
          alignItems: "center",
          borderWidth: 1,
          borderColor: disabled ? "#333" : color + (outline ? "99" : "44"),
          backgroundColor: disabled
            ? "#1a1a2e"
            : outline
              ? "transparent"
              : color + "22",
          flex: flex || undefined,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: disabled ? "#444" : color,
          fontWeight: "800",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* ══════════════════════════════════════════════════
   CAR CARD
══════════════════════════════════════════════════ */
function CarCard({ car, onPress, size = "sm" }) {
  const r = car.rarity;
  const dup = (car.count || 1) > 1;
  const imgH = size === "lg" ? 180 : 110;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={{
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: r.color + "30",
        marginBottom: 4,
      }}
    >
      <View style={{ height: 3, backgroundColor: r.color, opacity: 0.7 }} />
      <View
        style={{
          height: imgH,
          backgroundColor: r.color + "18",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {car.imageUri ? (
          <Image
            source={{ uri: car.imageUri }}
            style={{ width: "100%", height: "100%", resizeMode: "cover" }}
          />
        ) : (
          <Text style={{ fontSize: size === "lg" ? 56 : 36 }}>🚗</Text>
        )}
        {dup && (
          <View
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              backgroundColor: "#ffffff33",
              borderRadius: 10,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          >
            <Text style={{ fontSize: 9, fontWeight: "800", color: "#fff" }}>
              ×{car.count}
            </Text>
          </View>
        )}
      </View>
      <View style={{ padding: size === "lg" ? 14 : 10 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 6,
          }}
        >
          <View style={{ flex: 1, marginRight: 6 }}>
            <Text
              style={{
                fontSize: 9,
                color: C.muted,
                textTransform: "uppercase",
                letterSpacing: 0.8,
              }}
            >
              {car.make}
            </Text>
            <Text
              style={{
                fontSize: size === "lg" ? 17 : 13,
                fontWeight: "800",
                color: C.text,
              }}
              numberOfLines={1}
            >
              {car.model}
            </Text>
            <Text style={{ fontSize: 9, color: C.muted }}>{car.year}</Text>
          </View>
          <RarityBadge rarity={r} />
        </View>
        <Stars n={r.stars} color={r.color} size={size === "lg" ? 14 : 11} />
        {size === "lg" && car.power_hp > 0 && (
          <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
            {car.power_hp > 0 && (
              <MiniStat l="Puissance" v={`${car.power_hp} ch`} c={r.color} />
            )}
            {car.top_speed_kmh > 0 && (
              <MiniStat l="Vmax" v={`${car.top_speed_kmh} km/h`} c={r.color} />
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function MiniStat({ l, v, c }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#ffffff08",
        borderRadius: 8,
        padding: 8,
        borderWidth: 1,
        borderColor: c + "22",
      }}
    >
      <Text
        style={{
          fontSize: 8,
          color: C.muted,
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        {l}
      </Text>
      <Text style={{ fontSize: 12, fontWeight: "700", color: c }}>{v}</Text>
    </View>
  );
}

/* ══════════════════════════════════════════════════
   CAR DETAIL MODAL
══════════════════════════════════════════════════ */
function CarDetailModal({ car, onClose }) {
  const insets = useSafeAreaInsets();
  if (!car) return null;
  const r = car.rarity;
  const stats = [
    { l: "Puissance", v: car.power_hp > 0 ? `${car.power_hp} ch` : "—" },
    { l: "Vmax", v: car.top_speed_kmh > 0 ? `${car.top_speed_kmh} km/h` : "—" },
    { l: "0→100", v: car.zero_to_100 > 0 ? `${car.zero_to_100}s` : "—" },
    {
      l: "Prix neuf",
      v:
        car.price_eur_new > 0
          ? `${(car.price_eur_new / 1000).toFixed(0)}k€`
          : "—",
    },
    { l: "Mondial", v: (car.world_units_produced || 0).toLocaleString() },
    { l: "France", v: (car.france_units_estimated || 0).toLocaleString() },
  ];
  // pageSheet = iOS seulement ; undefined = comportement par défaut Android
  const presentation = Platform.OS === "ios" ? "pageSheet" : "fullScreen";
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle={presentation}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: C.card,
          paddingTop: Platform.OS === "android" ? insets.top : 0,
        }}
      >
        <ScrollView>
          <View style={{ height: 4, backgroundColor: r.color }} />
          {/* Bouton fermer pour fullScreen Android */}
          {Platform.OS === "android" && (
            <TouchableOpacity
              onPress={onClose}
              style={{
                position: "absolute",
                top: 12,
                right: 16,
                zIndex: 10,
                backgroundColor: "#00000066",
                borderRadius: 20,
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 18, lineHeight: 22 }}>
                ✕
              </Text>
            </TouchableOpacity>
          )}
          <View
            style={{
              height: 220,
              backgroundColor: r.color + "18",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {car.imageUri ? (
              <Image
                source={{ uri: car.imageUri }}
                style={{ width: "100%", height: 220 }}
                resizeMode="cover"
              />
            ) : (
              <Text style={{ fontSize: 72 }}>🚗</Text>
            )}
          </View>
          <View style={{ padding: 24 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 10,
              }}
            >
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text
                  style={{
                    fontSize: 10,
                    color: C.muted,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  {car.make} · {car.country_of_origin}
                </Text>
                <Text
                  style={{ fontSize: 24, fontWeight: "900", color: C.text }}
                >
                  {car.model}
                </Text>
                <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  {car.year} · {car.category}
                </Text>
              </View>
              <RarityBadge rarity={r} />
            </View>
            <Stars n={r.stars} color={r.color} size={18} />
            {/* Stats — grille sans gap pour compatibilité Android */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                marginTop: 16,
                marginRight: -8,
              }}
            >
              {stats.map((s) => (
                <View
                  key={s.l}
                  style={{
                    width: (W - 48 - 8) / 3,
                    backgroundColor: "#ffffff07",
                    borderRadius: 10,
                    padding: 10,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: r.color + "22",
                    marginRight: 8,
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 8,
                      color: C.muted,
                      textTransform: "uppercase",
                      marginBottom: 3,
                    }}
                  >
                    {s.l}
                  </Text>
                  <Text
                    style={{ fontSize: 13, fontWeight: "700", color: r.color }}
                  >
                    {s.v}
                  </Text>
                </View>
              ))}
            </View>
            {car.fun_fact && (
              <View
                style={{
                  backgroundColor: r.color + "15",
                  borderRadius: 12,
                  padding: 14,
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: r.color + "44",
                }}
              >
                <Text
                  style={{
                    fontSize: 8,
                    color: r.color,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 4,
                  }}
                >
                  Le saviez-vous ?
                </Text>
                <Text style={{ fontSize: 12, color: "#ccc", lineHeight: 18 }}>
                  {car.fun_fact}
                </Text>
              </View>
            )}
            {/* Boutons */}
            <View style={{ flexDirection: "row", marginTop: 24 }}>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  flex: 2,
                  backgroundColor: r.color + "22",
                  borderRadius: 14,
                  padding: 14,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: r.color + "55",
                }}
              >
                <Text
                  style={{ color: r.color, fontWeight: "800", fontSize: 14 }}
                >
                  Fermer
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════
   CHALLENGE POPUP
══════════════════════════════════════════════════ */
function ChallengePopup({ challenge, onClose }) {
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "#000000aa",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <View
          style={{
            backgroundColor: C.card,
            borderRadius: 24,
            padding: 32,
            width: "100%",
            maxWidth: 360,
            borderWidth: 1,
            borderColor: C.accent + "55",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 56, marginBottom: 8 }}>🏆</Text>
          <Text
            style={{
              fontSize: 10,
              color: C.accent,
              textTransform: "uppercase",
              letterSpacing: 2,
              marginBottom: 8,
            }}
          >
            Défi accompli !
          </Text>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "900",
              color: C.text,
              marginBottom: 4,
              textAlign: "center",
            }}
          >
            {challenge.label}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: C.muted,
              marginBottom: 24,
              textAlign: "center",
            }}
          >
            {challenge.description}
          </Text>
          <View
            style={{
              backgroundColor: C.accent + "22",
              borderRadius: 18,
              padding: 20,
              marginBottom: 24,
              borderWidth: 2,
              borderColor: C.accent + "55",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 10,
                color: C.muted,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Points bonus crédités
            </Text>
            <Text style={{ fontSize: 44, fontWeight: "900", color: C.accent }}>
              +{challenge.bonusScore}
            </Text>
            <Text style={{ fontSize: 11, color: C.muted }}>
              {challenge.freq === "daily"
                ? "Disponible demain"
                : challenge.freq === "weekly"
                  ? "La semaine prochaine"
                  : "Le mois prochain"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={{
              backgroundColor: C.accent + "22",
              borderRadius: 14,
              paddingVertical: 14,
              paddingHorizontal: 40,
              borderWidth: 1,
              borderColor: C.accent + "55",
            }}
          >
            <Text style={{ color: C.accent, fontWeight: "800", fontSize: 15 }}>
              Super ! 🎉
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ScannerScreen({
  onCarFound,
  fuel,
  isPremium,
  onUpgrade,
  onConsumeFuel,
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [cameraSize, setCameraSize] = useState(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [phase, setPhase] = useState("camera");
  const [capturedUri, setUri] = useState(null);
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const cameraRef = useRef(null);
  const shooting = useRef(false);
  const [demoCamera, setDemoCamera] = useState(false);
  const simulate = async () => {
    if (shooting.current) return;
    shooting.current = true;
    try {
      const response = await api("/recognize", {});
      onConsumeFuel(response.entitlements);
      const raw = response.car;
      setResult({
        ...raw,
        rarity: computeRarity(
          raw.world_units_produced,
          raw.france_units_estimated,
        ),
        imageUri: null,
        id: uid(),
        scannedAt: Date.now(),
        count: 1,
      });
      setPhase("result");
    } catch (error) {
      setErrMsg(error.message);
      setPhase("error");
    } finally {
      shooting.current = false;
      setCapturing(false);
    }
  };

  const shoot = async () => {
    if (!cameraRef.current || !cameraReady || shooting.current || (!isPremium && fuel <= 0))
      return;
    shooting.current = true;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
        () => {},
      );
      setCapturing(true); // Keep CameraView mounted until capture finishes.

      // Native processing preserves orientation on Android.
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        skipProcessing: false,
      });
      if (!photo?.uri) throw new Error("Aucune photo retournée par la caméra");
      setCameraReady(false);
      setPhase("scanning");

      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 640 } }],
        {
          compress: 0.6,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );
      if (!resized?.base64) throw new Error("Échec du redimensionnement");

      setUri(resized.uri);
      const response = await recognizeCar(resized.base64, "image/jpeg");
      const raw = response.car;
      onConsumeFuel(response.entitlements);
      const rarity = computeRarity(
        raw.world_units_produced || 0,
        raw.france_units_estimated || 0,
      );
      const card = {
        ...raw,
        rarity,
        imageUri: await keepPhoto(resized.uri, resized.base64).catch(
          () => resized.uri,
        ),
        id: uid(),
        scannedAt: Date.now(),
        count: 1,
      };
      setResult(card);
      setPhase("result");
      // ✅ Fuel consommé SEULEMENT après succès complet

      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    } catch (e) {
      console.error("[Scanner] Erreur:", e?.message || e);
      const s = String(e?.message || e);
      let msg = s.includes("CLE_INVALIDE")
        ? "🔑 Clé API invalide."
        : s.includes("SURCHARGE")
          ? "⏳ Serveur surchargé, réessaie."
          : s.includes("PARSE")
            ? "🔍 Véhicule non identifié."
            : s.includes("Network")
              ? "📶 Pas de connexion."
              : s.includes("caméra") || s.includes("photo")
                ? "📷 Erreur caméra — réessaie."
                : s.slice(0, 120);
      setErrMsg(msg);
      setPhase("error");
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Error,
      ).catch(() => {});
    } finally {
      shooting.current = false;
      setCapturing(false);
    }
  };

  const reset = () => {
    setCameraReady(false);
    setPhase("camera");
    setUri(null);
    setResult(null);
  };

  const canScan = isPremium || fuel > 0;

  if (DEMO_MODE && phase === "camera" && !demoCamera)
    return (
      <View style={s2.center}>
        <Text style={{ fontSize: 60 }}>🏎️</Text>
        <Text style={s2.permTitle}>Teste ta première carte</Text>
        <Text style={s2.permSub}>
          Sans compte ni clé API. Les voitures sont prédéfinies : aucune
          reconnaissance réelle dans ce mode.
        </Text>
        <Btn label="Créer une carte démo" onPress={simulate} />
        <View style={{ height: 14 }} />
        <Btn
          label="Tester la caméra"
          outline
          onPress={() => setDemoCamera(true)}
        />
        <View style={{ height: 14 }} />
        <Btn label="Ouvrir la boutique démo" outline onPress={onUpgrade} />
      </View>
    );

  if (!permission && (!DEMO_MODE || demoCamera))
    return (
      <View style={s2.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );

  if (!permission?.granted && (!DEMO_MODE || demoCamera))
    return (
      <View style={s2.center}>
        <Text style={{ fontSize: 52, marginBottom: 16 }}>📷</Text>
        <Text style={s2.permTitle}>Accès caméra requis</Text>
        <Text style={s2.permSub}>
          {DEMO_MODE
            ? "La caméra est testée localement. La photo ne sera pas analysée et le modèle sera fictif."
            : "La photo est transmise à notre serveur et au service IA pour identifier le véhicule."}
        </Text>
        <TouchableOpacity style={s2.permBtn} onPress={() => permission?.canAskAgain === false ? Linking.openSettings() : requestPermission()}>
          <Text style={[s2.permBtnText, { color: C.accent }]}>
            {permission?.canAskAgain === false ? "Ouvrir les paramètres caméra" : "Autoriser la caméra"}
          </Text>
        </TouchableOpacity>
      </View>
    );

  if (phase === "scanning")
    return (
      <View style={[s2.center, { backgroundColor: "#000" }]}>
        {capturedUri && (
          <Image
            source={{ uri: capturedUri }}
            style={StyleSheet.absoluteFillObject}
            blurRadius={8}
          />
        )}
        <View
          style={{
            backgroundColor: "#000000cc",
            borderRadius: 24,
            padding: 32,
            alignItems: "center",
          }}
        >
          <ActivityIndicator
            size="large"
            color={C.accent}
            style={{ marginBottom: 16 }}
          />
          <Text
            style={{
              color: C.accent,
              fontWeight: "700",
              fontSize: 16,
              letterSpacing: 1,
            }}
          >
            {DEMO_MODE ? "Création de la carte démo…" : "Analyse IA en cours…"}
          </Text>
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>
            Identification du modèle
          </Text>
        </View>
      </View>
    );

  if (phase === "error")
    return (
      <View style={s2.center}>
        <Text style={{ fontSize: 52, marginBottom: 16 }}>⚠️</Text>
        <Text style={[s2.permTitle, { color: "#FF6B6B", marginBottom: 12 }]}>
          Identification échouée
        </Text>
        <View
          style={{
            backgroundColor: "#FF444418",
            borderRadius: 14,
            padding: 16,
            borderWidth: 1,
            borderColor: "#FF444455",
            marginBottom: 28,
            width: "100%",
          }}
        >
          <Text
            style={{
              color: "#FF8888",
              fontSize: 13,
              textAlign: "center",
              lineHeight: 20,
            }}
          >
            {errMsg}
          </Text>
        </View>
        <View style={{ width: "100%", gap: 10 }}>
          <TouchableOpacity
            style={{
              backgroundColor: C.accent + "22",
              borderRadius: 14,
              padding: 14,
              alignItems: "center",
              borderWidth: 1,
              borderColor: C.accent + "55",
            }}
            onPress={reset}
          >
            <Text style={{ color: C.accent, fontWeight: "800", fontSize: 14 }}>
              📷 Reprendre une photo
            </Text>
          </TouchableOpacity>
          <Text
            style={{
              color: C.muted,
              fontSize: 11,
              textAlign: "center",
              marginTop: 4,
            }}
          >
            Conseils : bonne lumière · voiture entière visible · pas de flou
          </Text>
        </View>
      </View>
    );

  if (phase === "result" && result) {
    const r = result.rarity;
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: C.bg }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      >
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <Text style={{ fontSize: 22, marginBottom: 4 }}>🎉</Text>
          <Text style={{ fontSize: 20, fontWeight: "900", color: r.color }}>
            {r.emoji} {r.label} découvert !
          </Text>
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
            {result.confidence}% confiance · +{r.score} pts
          </Text>
        </View>
        <View accessibilityLiveRegion="polite" style={{padding: 14, borderRadius: 12, backgroundColor: C.panel, marginBottom: 16}}>
          <Text style={{color: C.accent, fontSize: 18, fontWeight: "800", textAlign: "center"}}>{isPremium ? "Scans illimités" : `${fuel} crédit${fuel === 1 ? "" : "s"} restant${fuel === 1 ? "" : "s"}`}</Text>
          {!isPremium && <Text style={{color: C.muted, fontSize: 14, textAlign: "center", marginTop: 6}}>1 crédit utilisé pour cette photo{DEMO_MODE ? " · Démonstration" : ""}</Text>}
        </View>
        <CarCard car={result} size="lg" />
        {result.fun_fact && (
          <View
            style={{
              backgroundColor: r.color + "15",
              borderRadius: 12,
              padding: 14,
              marginTop: 12,
              borderWidth: 1,
              borderColor: r.color + "44",
            }}
          >
            <Text
              style={{
                fontSize: 8,
                color: r.color,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 4,
              }}
            >
              Le saviez-vous ?
            </Text>
            <Text style={{ fontSize: 12, color: "#ccc", lineHeight: 18 }}>
              {result.fun_fact}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
          <Btn label="Annuler" onPress={reset} outline color="#666" flex={1} />
          <Btn
            label="➕ Ajouter au garage"
            onPress={() => {
              onCarFound(result);
              reset();
            }}
            color={r.color}
            flex={2}
          />
        </View>
      </ScrollView>
    );
  }

  // ── Camera ───────────────────────────────────────────────────────────────────
  // Réservoir vide → affiche le paywall
  if (!canScan) {
    return (
      <View style={[s2.center, { padding: 28 }]}>
        <Text style={{ fontSize: 56, marginBottom: 16 }}>⛽</Text>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "900",
            color: "#EF4444",
            marginBottom: 8,
          }}
        >
          Réservoir vide !
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: C.muted,
            textAlign: "center",
            lineHeight: 20,
            marginBottom: 6,
          }}
        >
          Aucun scan disponible. Connecte-toi ou recharge ton compte.
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: C.text,
            fontWeight: "700",
            marginBottom: 28,
          }}
        >
          5 scans gratuits chaque jour à minuit (heure de Paris)
        </Text>
        <TouchableOpacity
          onPress={onUpgrade}
          style={{
            backgroundColor: C.accent,
            borderRadius: 16,
            paddingVertical: 14,
            paddingHorizontal: 32,
          }}
        >
          <Text style={{ color: "#000", fontWeight: "900", fontSize: 15 }}>
            👑 Passer Premium
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View collapsable={false} style={{ flex: 1, backgroundColor: "#000" }} onLayout={({nativeEvent: {layout}}) => {
      if (layout.width > 0 && layout.height > 0) setCameraSize(previous => previous?.width === layout.width && previous?.height === layout.height ? previous : {width: layout.width, height: layout.height});
    }}>
      {cameraSize && <CameraView
        key={cameraKey}
        ref={cameraRef}
        style={{width: cameraSize.width, height: cameraSize.height}}
        mode="picture"
        facing="back"
        onCameraReady={() => setCameraReady(true)}
        onMountError={({ message }) => {
          setCameraReady(false);
          setErrMsg("Impossible de démarrer la caméra : " + message);
          setPhase("error");
        }}
      />}

      {/* ── Indicateur scans restants + bouton Premium ── */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: "#000000bb",
          paddingVertical: 10,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Gouttes restantes */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ fontSize: 14, marginRight: 6 }}>⛽</Text>
          {isPremium ? (
            <Text style={{ fontSize: 12, color: C.accent, fontWeight: "800" }}>
              ∞ scans
            </Text>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {Array(MAX_FUEL)
                .fill(0)
                .map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: 10,
                      height: 14,
                      borderRadius: 5,
                      marginRight: 3,
                      backgroundColor: i < fuel ? "#34D399" : "#ffffff20",
                    }}
                  />
                ))}
              <Text
                style={{
                  fontSize: 11,
                  color:
                    fuel <= 1 ? "#EF4444" : fuel <= 2 ? "#F97316" : "#34D399",
                  fontWeight: "700",
                  marginLeft: 6,
                }}
              >
                {fuel} scans
              </Text>
            </View>
          )}
        </View>

        {/* Bouton Premium */}
        {!isPremium && (
          <TouchableOpacity
            onPress={onUpgrade}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: C.accent + "33",
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderWidth: 1,
              borderColor: C.accent + "66",
            }}
          >
            <Text style={{ fontSize: 12, marginRight: 4 }}>👑</Text>
            <Text style={{ fontSize: 11, color: C.accent, fontWeight: "800" }}>
              Premium
            </Text>
          </TouchableOpacity>
        )}
        {isPremium && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#FBBF2422",
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 5,
            }}
          >
            <Text style={{ fontSize: 11, color: C.accent, fontWeight: "800" }}>
              👑 Pass actif
            </Text>
          </View>
        )}
      </View>

      {/* Coins du cadre de visée */}
      <View style={s2.frameContainer} pointerEvents="none">
        {[
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].map(([sx, sy], i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              top: sy < 0 ? 0 : undefined,
              bottom: sy > 0 ? 0 : undefined,
              left: sx < 0 ? 0 : undefined,
              right: sx > 0 ? 0 : undefined,
              width: 32,
              height: 32,
              borderTopWidth: sy < 0 ? 3 : 0,
              borderBottomWidth: sy > 0 ? 3 : 0,
              borderLeftWidth: sx < 0 ? 3 : 0,
              borderRightWidth: sx > 0 ? 3 : 0,
              borderColor: C.accent,
            }}
          />
        ))}
      </View>

      {/* Bouton déclencheur */}
      <View style={s2.shutterArea}>
        <TouchableOpacity disabled={capturing} accessibilityRole="button" onPress={() => {setCameraReady(false); setCameraKey(value => value + 1);}} style={{padding:12,marginBottom:12,backgroundColor:"#000000aa",borderRadius:12}}>
          <Text style={{color:"#fff",fontSize:14}}>Relancer l’aperçu</Text>
        </TouchableOpacity>
        <Text
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: 12,
            marginBottom: 20,
          }}
        >
          Vise le véhicule et appuie
        </Text>
        <TouchableOpacity accessibilityLabel={capturing ? "Photo en cours" : cameraReady ? "Prendre une photo" : "Caméra en préparation"} disabled={!cameraReady || capturing} onPress={shoot} style={[s2.shutterOuter, {opacity: cameraReady && !capturing ? 1 : 0.4}]}>
          <View style={s2.shutterInner} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s2 = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  permTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: C.text,
    textAlign: "center",
    marginBottom: 8,
  },
  permSub: {
    fontSize: 13,
    color: C.muted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },
  permBtn: {
    borderWidth: 1,
    borderColor: C.accent + "55",
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 32,
  },
  permBtnText: { fontWeight: "700", fontSize: 14 },
  frameContainer: {
    position: "absolute",
    top: "25%",
    left: "10%",
    right: "10%",
    bottom: "25%",
  },
  shutterArea: {
    position: "absolute",
    bottom: 52,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
  },
});

/* ══════════════════════════════════════════════════
   GARAGE SCREEN
══════════════════════════════════════════════════ */
function GarageScreen({ player }) {
  const garage = player.garage || [];
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("date");
  const [detail, setDetail] = useState(null);

  const displayed = (
    filter === "ALL" ? garage : garage.filter((c) => c.rarity.id === filter)
  )
    .slice()
    .sort((a, b) =>
      sort === "score"
        ? (b.rarity?.score || 0) - (a.rarity?.score || 0)
        : sort === "alpha"
          ? `${a.make}${a.model}`.localeCompare(`${b.make}${b.model}`)
          : b.scannedAt - a.scannedAt,
    );

  const gs = garageScore(garage);
  const bs = bonusScore(player.completions);
  const rc = Object.keys(RARITIES).reduce((a, k) => {
    a[k] = garage.filter((c) => c.rarity.id === k).length;
    return a;
  }, {});

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <Text
            style={{
              fontSize: 10,
              color: C.accent,
              textTransform: "uppercase",
              letterSpacing: 2,
              marginBottom: 4,
            }}
          >
            Mon Garage
          </Text>
          <Text style={{ fontSize: 22, fontWeight: "900", color: C.text }}>
            {garage.length} véhicule{garage.length !== 1 ? "s" : ""}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            {[
              {
                l: "Garage",
                v: `🚗 ${gs.toLocaleString()}`,
                bc: C.border,
                tc: C.text,
              },
              {
                l: "Défis",
                v: `🏆 ${bs.toLocaleString()}`,
                bc: "#FBBF2433",
                tc: C.accent,
              },
              {
                l: "Total",
                v: `⭐ ${(gs + bs).toLocaleString()}`,
                bc: "#34D39933",
                tc: "#34D399",
              },
            ].map((s) => (
              <View
                key={s.l}
                style={{
                  flex: 1,
                  backgroundColor: "#ffffff08",
                  borderRadius: 12,
                  padding: 10,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: s.bc,
                }}
              >
                <Text
                  style={{
                    fontSize: 8,
                    color: C.muted,
                    textTransform: "uppercase",
                  }}
                >
                  {s.l}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "800",
                    color: s.tc,
                    marginTop: 2,
                  }}
                >
                  {s.v}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Rarity chips */}
        <View style={{ flexDirection: "row", gap: 5, marginBottom: 14 }}>
          {Object.values(RARITIES).map((r) => {
            const act = filter === r.id;
            return (
              <TouchableOpacity
                key={r.id}
                onPress={() => setFilter(act ? "ALL" : r.id)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: act ? r.color + "22" : "#ffffff06",
                  borderWidth: 1,
                  borderColor: act ? r.color + "66" : C.border,
                }}
              >
                <Text style={{ fontSize: 13 }}>{r.emoji}</Text>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "900",
                    color: act ? r.color : C.text,
                  }}
                >
                  {rc[r.id] || 0}
                </Text>
                <Text
                  style={{
                    fontSize: 7,
                    color: C.muted,
                    textTransform: "uppercase",
                  }}
                >
                  {r.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Sort */}
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
          {[
            ["date", "Récent"],
            ["score", "Rareté"],
            ["alpha", "A→Z"],
          ].map(([v, l]) => (
            <TouchableOpacity
              key={v}
              onPress={() => setSort(v)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: sort === v ? "#ffffff15" : "transparent",
                borderWidth: 1,
                borderColor: sort === v ? "#ffffff33" : C.border,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: sort === v ? C.text : C.muted,
                }}
              >
                {l}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {displayed.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <Text style={{ fontSize: 52, marginBottom: 12 }}>🚗</Text>
            <Text style={{ fontSize: 15, color: C.muted }}>
              {garage.length === 0
                ? "Scanne ta première voiture !"
                : "Aucun véhicule ici"}
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {displayed.map((car) => (
              <View key={car.id} style={{ width: (W - 42) / 2 }}>
                <CarCard car={car} onPress={() => setDetail(car)} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <CarDetailModal car={detail} onClose={() => setDetail(null)} />
    </View>
  );
}

/* ══════════════════════════════════════════════════
   CHALLENGE SCREEN
══════════════════════════════════════════════════ */
function ChallengeScreen({ player, onToggle }) {
  const completions = player.completions || [];
  const activeIds = player.activeChallengeIds || [];
  const grouped = { daily: [], weekly: [], monthly: [] };
  CHALLENGES.forEach((ch) => grouped[ch.freq].push(ch));

  const getComp = (ch) =>
    completions.find(
      (c) => c.challengeId === ch.id && isStillLocked(c, ch.freq),
    );
  const isActive = (ch) => activeIds.includes(ch.id);
  const isLocked = (ch) => !!getComp(ch);
  const timesComp = (ch) =>
    completions.filter((c) => c.challengeId === ch.id).length;

  const bs = bonusScore(completions);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
    >
      <View style={{ alignItems: "center", marginBottom: 20 }}>
        <Text
          style={{
            fontSize: 10,
            color: C.accent,
            textTransform: "uppercase",
            letterSpacing: 2,
            marginBottom: 4,
          }}
        >
          Défis
        </Text>
        <Text style={{ fontSize: 22, fontWeight: "900", color: C.text }}>
          Défis & Récompenses
        </Text>
        <Text style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
          Active → Scanne → Valide → Gagne
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
          backgroundColor: "#FBBF2415",
          borderRadius: 18,
          padding: 20,
          borderWidth: 1,
          borderColor: "#FBBF2444",
          marginBottom: 24,
        }}
      >
        <Text style={{ fontSize: 36 }}>🏆</Text>
        <View>
          <Text style={{ fontSize: 11, color: C.muted }}>
            Points bonus cumulés
          </Text>
          <Text style={{ fontSize: 28, fontWeight: "900", color: C.accent }}>
            +{bs.toLocaleString()} pts
          </Text>
          <Text style={{ fontSize: 11, color: C.muted }}>
            {completions.length} défi{completions.length !== 1 ? "s" : ""}{" "}
            complété{completions.length !== 1 ? "s" : ""}
          </Text>
        </View>
      </View>

      {Object.entries(grouped).map(([freq, list]) => (
        <View key={freq} style={{ marginBottom: 24 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: FREQ_COLOR[freq],
              }}
            />
            <Text
              style={{
                fontSize: 10,
                fontWeight: "800",
                color: FREQ_COLOR[freq],
                textTransform: "uppercase",
                letterSpacing: 1.5,
              }}
            >
              {FREQ_LABEL[freq]}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
          </View>
          {list.map((ch) => {
            const locked = isLocked(ch);
            const activ = isActive(ch);
            const comp = getComp(ch);
            const tc = timesComp(ch);
            return (
              <View
                key={ch.id}
                style={{
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 8,
                  borderWidth: 1,
                  backgroundColor: locked
                    ? "#34D39910"
                    : activ
                      ? C.accent + "12"
                      : C.surface,
                  borderColor: locked
                    ? "#34D39944"
                    : activ
                      ? C.accent + "44"
                      : C.border,
                  opacity: locked ? 0.85 : 1,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <Text style={{ fontSize: 26, width: 34 }}>
                    {locked ? "✅" : ch.icon}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "800",
                        color: locked ? "#34D399" : C.text,
                      }}
                    >
                      {ch.label}
                    </Text>
                    <Text
                      style={{ fontSize: 12, color: C.muted, marginTop: 1 }}
                    >
                      {ch.description}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        marginTop: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          color: C.accent,
                          fontWeight: "700",
                        }}
                      >
                        +{ch.bonusScore} pts
                      </Text>
                      {locked && (
                        <Text style={{ fontSize: 10, color: "#34D399" }}>
                          🔄 Reset dans {getTimeLeft(ch.freq)}
                        </Text>
                      )}
                      {!locked && activ && (
                        <Text style={{ fontSize: 10, color: C.accent }}>
                          ● En cours
                        </Text>
                      )}
                    </View>
                    {locked && comp && (
                      <Text
                        style={{ fontSize: 10, color: C.muted, marginTop: 3 }}
                      >
                        Validé avec {comp.carMake} {comp.carModel}
                      </Text>
                    )}
                    {tc > 0 && (
                      <Text
                        style={{ fontSize: 10, color: C.muted, marginTop: 2 }}
                      >
                        Complété {tc}× au total
                      </Text>
                    )}
                  </View>
                  <View>
                    {locked ? (
                      <View
                        style={{
                          backgroundColor: "#34D39915",
                          borderRadius: 10,
                          paddingVertical: 5,
                          paddingHorizontal: 10,
                          borderWidth: 1,
                          borderColor: "#34D39955",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            color: "#34D399",
                            fontWeight: "800",
                          }}
                        >
                          Validé ✓
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={{
                          backgroundColor: C.accent + "15",
                          borderRadius: 10,
                          paddingVertical: 5,
                          paddingHorizontal: 10,
                          borderWidth: 1,
                          borderColor: C.accent + "33",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            color: C.accent,
                            fontWeight: "700",
                          }}
                        >
                          Auto 🤖
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

/* ══════════════════════════════════════════════════
   SOCIAL SCREEN — Leaderboard + Amis
══════════════════════════════════════════════════ */
function GaragePreviewModal({ friend, onClose }) {
  const r_map = Object.values(RARITIES).reduce(
    (a, r) => ({ ...a, [r.id]: r }),
    {},
  );
  const garage = friend.garage || [];
  const rc = Object.keys(RARITIES).reduce((a, k) => {
    a[k] = garage.filter((c) => c.rarity?.id === k).length;
    return a;
  }, {});
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaViewCompat style={{ flex: 1, backgroundColor: C.card }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <Text style={{ fontSize: 36, marginRight: 12 }}>
              {friend.avatar}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: "900", color: C.text }}>
                {friend.name}
              </Text>
              <Text
                style={{ fontSize: 12, color: C.accent, fontWeight: "700" }}
              >
                ⭐ {friend.score?.toLocaleString()} pts · {garage.length}{" "}
                voitures
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: C.muted, fontSize: 22 }}>✕</Text>
            </TouchableOpacity>
          </View>
          {/* Rarity breakdown */}
          <View style={{ flexDirection: "row", marginBottom: 16 }}>
            {Object.values(RARITIES).map((r) => (
              <View
                key={r.id}
                style={{
                  flex: 1,
                  alignItems: "center",
                  backgroundColor: C.surface,
                  borderRadius: 10,
                  paddingVertical: 8,
                  marginRight: 4,
                  borderWidth: 1,
                  borderColor: rc[r.id] > 0 ? r.color + "44" : C.border,
                }}
              >
                <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "900",
                    color: rc[r.id] > 0 ? r.color : C.muted,
                  }}
                >
                  {rc[r.id]}
                </Text>
              </View>
            ))}
          </View>
          {/* Car list */}
          {garage.length === 0 ? (
            <Text
              style={{ color: C.muted, textAlign: "center", marginTop: 20 }}
            >
              Garage vide
            </Text>
          ) : (
            garage.slice(0, 20).map((car) => {
              const r = r_map[car.rarity?.id] || RARITIES.COMMON;
              return (
                <View
                  key={car.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: C.border,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: r.color + "22",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>🚗</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ fontSize: 13, fontWeight: "700", color: C.text }}
                    >
                      {car.make} {car.model}
                    </Text>
                    <Text style={{ fontSize: 11, color: C.muted }}>
                      {car.year} · {car.category}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: r.bg,
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderWidth: 1,
                      borderColor: r.color + "44",
                    }}
                  >
                    <Text
                      style={{ fontSize: 9, color: r.color, fontWeight: "800" }}
                    >
                      {r.emoji} {r.label}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaViewCompat>
    </Modal>
  );
}

// SafeAreaView compatible avec notre setup
function SafeAreaViewCompat({ children, style }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ flex: 1, paddingTop: insets.top }, style]}>{children}</View>
  );
}

function SocialScreen({ player, onUpdatePlayer }) {
  const [subTab, setSubTab] = useState("ranking"); // ranking | friends | requests
  const [leaders, setLeaders] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loadingLB, setLoadingLB] = useState(true);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchRes, setSearchRes] = useState([]);
  const [viewGarage, setViewGarage] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, color = C.accent) => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3000);
  };

  // Charge le leaderboard
  useEffect(() => {
    fetchLeaderboard().then((data) => {
      setLeaders(data);
      setLoadingLB(false);
    });
  }, []);

  // Charge les profils des amis
  useEffect(() => {
    if (!player?.friends?.length) {
      setFriends([]);
      return;
    }
    Promise.all(player.friends.map((id) => fetchPlayerById(id))).then((data) =>
      setFriends(data.filter(Boolean)),
    );
  }, [player?.friends]);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    const res = await searchPlayerByName(search.trim());
    setSearchRes(res.filter((p) => p.id !== player.id));
    setSearching(false);
  };

  const handleAddFriend = async (target) => {
    if ((player.friends || []).includes(target.id)) {
      showToast("Déjà ami !");
      return;
    }
    const ok = await sendFriendRequest(player, target.id);
    showToast(
      ok
        ? `Demande envoyée à ${target.name} !`
        : "Firebase non configuré — active-le d'abord.",
    );
  };

  const handleAccept = async (fromId) => {
    await acceptFriendRequest(player, fromId);
    const req = (player.friendRequests || []).find((r) => r.fromId === fromId);
    const updated = {
      ...player,
      friends: [...(player.friends || []), fromId],
      friendRequests: (player.friendRequests || []).filter(
        (r) => r.fromId !== fromId,
      ),
    };
    onUpdatePlayer(updated);
    showToast(`${req?.fromName || "Ami"} ajouté !`, "#34D399");
  };

  const handleDecline = async (fromId) => {
    await declineFriendRequest(player, fromId);
    const updated = {
      ...player,
      friendRequests: (player.friendRequests || []).filter(
        (r) => r.fromId !== fromId,
      ),
    };
    onUpdatePlayer(updated);
  };

  const handleRemoveFriend = async (friendId, friendName) => {
    await removeFriend(player.id, friendId);
    const updated = {
      ...player,
      friends: (player.friends || []).filter((i) => i !== friendId),
    };
    onUpdatePlayer(updated);
    showToast(`${friendName} retiré de tes amis`, "#9CA3AF");
  };

  const friendRequests = player?.friendRequests || [];
  const myRank = leaders.findIndex((l) => l.id === player.id) + 1;

  const SUBTABS = [
    { id: "ranking", label: "🏆 Classement" },
    { id: "friends", label: `👥 Amis (${(player?.friends || []).length})` },
    {
      id: "requests",
      label: `📩 Demandes${friendRequests.length > 0 ? ` (${friendRequests.length})` : ""}`,
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Sub-tabs */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: C.surface,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        }}
      >
        {SUBTABS.map((t) => (
          <TouchableOpacity
            key={t.id}
            onPress={() => setSubTab(t.id)}
            style={{
              flex: 1,
              paddingVertical: 12,
              alignItems: "center",
              borderBottomWidth: 2,
              borderBottomColor: subTab === t.id ? C.accent : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: subTab === t.id ? C.accent : C.muted,
              }}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── CLASSEMENT ── */}
      {subTab === "ranking" && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={{ alignItems: "center", marginBottom: 16 }}>
            <Text style={{ fontSize: 22, fontWeight: "900", color: C.text }}>
              Classement mondial
            </Text>
            {myRank > 0 && (
              <Text style={{ fontSize: 13, color: C.accent, marginTop: 4 }}>
                Ta position : #{myRank}
              </Text>
            )}
            {!db && (
              <Text
                style={{
                  fontSize: 11,
                  color: "#F97316",
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                ⚠️ Firebase non configuré — leaderboard non disponible
              </Text>
            )}
          </View>

          {loadingLB && (
            <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} />
          )}

          {leaders.map((p, i) => {
            const isMe = p.id === player.id;
            const medals = ["🥇", "🥈", "🥉"];
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => setViewGarage(p)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 14,
                  marginBottom: 8,
                  borderRadius: 16,
                  backgroundColor: isMe ? C.accent + "18" : C.surface,
                  borderWidth: 1,
                  borderColor: isMe ? C.accent + "55" : C.border,
                }}
              >
                <Text style={{ fontSize: 22, width: 36, textAlign: "center" }}>
                  {medals[i] || `#${i + 1}`}
                </Text>
                <Text style={{ fontSize: 22, marginHorizontal: 8 }}>
                  {p.avatar}
                </Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: isMe ? C.accent : C.text,
                      }}
                    >
                      {p.name}
                    </Text>
                    {p.isPremium && (
                      <Text
                        style={{
                          fontSize: 9,
                          backgroundColor: C.accent,
                          color: "#000",
                          paddingHorizontal: 5,
                          paddingVertical: 1,
                          borderRadius: 8,
                          marginLeft: 6,
                          fontWeight: "900",
                        }}
                      >
                        PRO
                      </Text>
                    )}
                    {isMe && (
                      <Text
                        style={{ fontSize: 10, color: C.muted, marginLeft: 6 }}
                      >
                        (moi)
                      </Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 10, color: C.muted }}>
                    {p.garageCount} voitures
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "900",
                    color: isMe ? C.accent : "#FBBF24",
                  }}
                >
                  ⭐{p.score?.toLocaleString()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── AMIS ── */}
      {subTab === "friends" && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Recherche */}
          <View
            style={{
              backgroundColor: C.surface,
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: C.border,
              marginBottom: 20,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: C.muted,
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 1,
                fontWeight: "700",
              }}
            >
              Chercher un joueur
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Pseudo exact…"
                placeholderTextColor={C.muted}
                onSubmitEditing={handleSearch}
                style={{
                  flex: 1,
                  backgroundColor: C.bg,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: C.border,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: C.text,
                }}
              />
              <TouchableOpacity
                onPress={handleSearch}
                style={{
                  backgroundColor: C.accent + "22",
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: C.accent + "55",
                }}
              >
                {searching ? (
                  <ActivityIndicator size="small" color={C.accent} />
                ) : (
                  <Text style={{ color: C.accent, fontWeight: "800" }}>🔍</Text>
                )}
              </TouchableOpacity>
            </View>
            {searchRes.map((p) => (
              <View
                key={p.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderTopWidth: 1,
                  borderTopColor: C.border,
                  marginTop: 8,
                }}
              >
                <Text style={{ fontSize: 24, marginRight: 10 }}>
                  {p.avatar}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontSize: 14, fontWeight: "700", color: C.text }}
                  >
                    {p.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.muted }}>
                    ⭐{p.score?.toLocaleString()} · {p.garageCount} voitures
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleAddFriend(p)}
                  style={{
                    backgroundColor: (player.friends || []).includes(p.id)
                      ? C.surface
                      : C.accent + "22",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderWidth: 1,
                    borderColor: (player.friends || []).includes(p.id)
                      ? C.border
                      : C.accent + "55",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "800",
                      color: (player.friends || []).includes(p.id)
                        ? C.muted
                        : C.accent,
                    }}
                  >
                    {(player.friends || []).includes(p.id)
                      ? "✓ Ami"
                      : "+ Ajouter"}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Liste des amis */}
          <Text
            style={{
              fontSize: 11,
              color: C.muted,
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 12,
              fontWeight: "700",
            }}
          >
            Mes amis ({friends.length})
          </Text>
          {friends.length === 0 && (
            <View
              style={{
                alignItems: "center",
                paddingVertical: 32,
                backgroundColor: C.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: C.border,
              }}
            >
              <Text style={{ fontSize: 32, marginBottom: 8 }}>👥</Text>
              <Text style={{ color: C.muted, fontSize: 13 }}>
                Pas encore d'amis
              </Text>
              <Text style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
                Cherche un joueur par son pseudo
              </Text>
            </View>
          )}
          {friends.map((f) => (
            <View
              key={f.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 14,
                marginBottom: 8,
                borderRadius: 16,
                backgroundColor: C.surface,
                borderWidth: 1,
                borderColor: C.border,
              }}
            >
              <Text style={{ fontSize: 24, marginRight: 10 }}>{f.avatar}</Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 14, fontWeight: "700", color: C.text }}
                >
                  {f.name}
                </Text>
                <Text style={{ fontSize: 11, color: C.muted }}>
                  ⭐{f.score?.toLocaleString()} · {f.garageCount} voitures
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setViewGarage(f)}
                style={{
                  marginRight: 8,
                  backgroundColor: C.accent + "15",
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: C.accent + "33",
                }}
              >
                <Text
                  style={{ fontSize: 11, color: C.accent, fontWeight: "700" }}
                >
                  Garage
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRemoveFriend(f.id, f.name)}
              >
                <Text style={{ color: "#EF4444", fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── DEMANDES ── */}
      {subTab === "requests" && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text
            style={{
              fontSize: 11,
              color: C.muted,
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 12,
              fontWeight: "700",
            }}
          >
            Demandes reçues ({friendRequests.length})
          </Text>
          {friendRequests.length === 0 && (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>📩</Text>
              <Text style={{ color: C.muted }}>Aucune demande en attente</Text>
            </View>
          )}
          {friendRequests.map((req) => (
            <View
              key={req.fromId}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 14,
                marginBottom: 8,
                borderRadius: 16,
                backgroundColor: C.surface,
                borderWidth: 1,
                borderColor: C.accent + "33",
              }}
            >
              <Text style={{ fontSize: 28, marginRight: 10 }}>
                {req.fromAvatar}
              </Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 14, fontWeight: "700", color: C.text }}
                >
                  {req.fromName}
                </Text>
                <Text style={{ fontSize: 10, color: C.muted }}>
                  veut être ton ami
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleAccept(req.fromId)}
                style={{
                  backgroundColor: "#34D39922",
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderWidth: 1,
                  borderColor: "#34D39955",
                  marginRight: 8,
                }}
              >
                <Text
                  style={{ color: "#34D399", fontWeight: "800", fontSize: 12 }}
                >
                  ✓ Accepter
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDecline(req.fromId)}
                style={{
                  backgroundColor: "#EF444415",
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderWidth: 1,
                  borderColor: "#EF444433",
                }}
              >
                <Text
                  style={{ color: "#EF4444", fontWeight: "800", fontSize: 12 }}
                >
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Garage preview modal */}
      {viewGarage && (
        <GaragePreviewModal
          friend={viewGarage}
          onClose={() => setViewGarage(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <View
          style={{
            position: "absolute",
            bottom: 20,
            left: 16,
            right: 16,
            backgroundColor: C.card,
            borderRadius: 14,
            padding: 14,
            borderWidth: 1,
            borderColor: toast.color + "66",
            alignItems: "center",
          }}
        >
          <Text style={{ color: toast.color, fontWeight: "700", fontSize: 13 }}>
            {toast.msg}
          </Text>
        </View>
      )}
    </View>
  );
}

/* ══════════════════════════════════════════════════
   ONBOARDING
══════════════════════════════════════════════════ */
const AVATARS = [
  "🏎️",
  "🚀",
  "🦁",
  "🐺",
  "🦊",
  "🐉",
  "⚡",
  "💀",
  "🔥",
  "🌙",
  "🌊",
  "🦅",
];

function OnboardingScreen({ onDone }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("🏎️");
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
        paddingTop: insets.top + 28,
        paddingBottom: insets.bottom + 28,
      }}
    >
      <Text style={{ fontSize: 64, marginBottom: 8 }}>🏁</Text>
      <Text
        style={{
          fontSize: 34,
          fontWeight: "900",
          color: C.accent,
          letterSpacing: 2,
        }}
      >
        CarDrive
      </Text>
      <Text
        style={{
          fontSize: 10,
          color: C.accent,
          letterSpacing: 4,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        TCG
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: C.muted,
          textAlign: "center",
          lineHeight: 20,
          marginBottom: 36,
        }}
      >
        Scanne des voitures, complète des défis,{"\n"}bats tes amis au
        classement.
      </Text>

      <View style={{ width: "100%", marginBottom: 16 }}>
        <Text
          style={{
            fontSize: 10,
            color: C.muted,
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 8,
          }}
        >
          Ton pseudo
        </Text>
        <TextInput
          value={name}
          onChangeText={(t) => setName(t.slice(0, 20))}
          placeholder="Entre ton pseudo…"
          placeholderTextColor={C.muted}
          style={{
            backgroundColor: C.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: name ? C.accent + "66" : C.border,
            padding: 14,
            fontSize: 15,
            fontWeight: "700",
            color: C.text,
          }}
        />
      </View>

      <View style={{ width: "100%", marginBottom: 32 }}>
        <Text
          style={{
            fontSize: 10,
            color: C.muted,
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 10,
          }}
        >
          Avatar
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {AVATARS.map((a, idx) => (
            <TouchableOpacity
              key={a}
              onPress={() => setAvatar(a)}
              style={{
                width: (W - 56 - 44) / 6,
                aspectRatio: 1,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: avatar === a ? C.accent + "22" : "#ffffff08",
                borderWidth: 2,
                borderColor: avatar === a ? C.accent : "transparent",
                marginRight: (idx + 1) % 6 === 0 ? 0 : 8,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 22 }}>{a}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        disabled={!name.trim()}
        onPress={() => name.trim() && onDone({ name: name.trim(), avatar })}
        style={{
          width: "100%",
          backgroundColor: name.trim() ? C.accent + "22" : "#1a1a2e",
          borderRadius: 14,
          padding: 16,
          alignItems: "center",
          borderWidth: 1,
          borderColor: name.trim() ? C.accent + "55" : "#333",
          opacity: name.trim() ? 1 : 0.5,
        }}
      >
        <Text
          style={{
            color: name.trim() ? C.accent : "#444",
            fontWeight: "800",
            fontSize: 15,
          }}
        >
          {name.trim() ? "🚀 Démarrer l'aventure" : "Entre ton pseudo d'abord"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/* ══════════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════════ */
function AppInner() {
  const [player, setPlayer] = useState(null);
  const [tab, setTab] = useState("scan");
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [challengePopup, setPopup] = useState(null);
  const [fuel, setFuel] = useState(0);
  const [showPremium, setPremium] = useState(false);

  const [entitlements, setEntitlements] = useState({
    isPremium: false,
    remaining: 0,
    credits: 0,
  });
  const [accountError, setAccountError] = useState("");
  const playerRef = useRef(null);
  playerRef.current = player;

  const applyEntitlements = useCallback((value) => {
    setEntitlements(value);
    setFuel(value.remaining);
  }, []);

  const refreshAccount = useCallback(async () => {
    try {
      const value = await api("/me");
      applyEntitlements(value);
      setAccountError("");
      return value;
    } catch (error) {
      applyEntitlements({ isPremium: false, remaining: 0, credits: 0 });
      setAccountError(error.message);
      throw error;
    }
  }, [applyEntitlements]);

  useEffect(() => {
    let live = true;
    loadPlayer()
      .then((saved) => {
        if (live && saved) setPlayer({ ...saved, isPremium: false });
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    refreshAccount().catch(() => {});
    return () => {
      live = false;
    };
  }, [refreshAccount]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshAccount().catch(() => {});
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") refreshAccount().catch(() => {});
    }, 60000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [refreshAccount]);

  useEffect(() => {
    if (!player?.id || !db) return;
    let live = true;
    const poll = async () => {
      const remote = await fetchPlayerById(player.id);
      const current = playerRef.current;
      if (!live || !remote || current?.id !== player.id) return;
      const updated = {
        ...current,
        friendRequests: remote.friendRequests || [],
        friends: remote.friends || [],
      };
      setPlayer(updated);
      await savePlayer(updated);
    };
    poll();
    const timer = setInterval(poll, 30000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [player?.id]);

  const persist = async (updated) => {
    setPlayer(updated);
    await savePlayer(updated);
    syncToFirebase(updated);
  };

  const createPlayer = async ({ name, avatar }) => {
    await persist({
      id: uid(),
      name,
      avatar,
      garage: [],
      completions: [],
      createdAt: Date.now(),
    });
  };

  const addCar = async (car) => {
    if (!player) return;
    const dup = player.garage.find(
      (c) => c.make === car.make && c.model === car.model,
    );
    const newGarage = dup
      ? player.garage.map((c) =>
          c.id === dup.id ? { ...c, count: (c.count || 1) + 1 } : c,
        )
      : [car, ...player.garage];

    // Vérifie TOUS les défis automatiquement — aucune activation manuelle requise
    let newCompletions = [...(player.completions || [])];
    let completed = [];
    for (const ch of CHALLENGES) {
      const alreadyDone = newCompletions.some(
        (c) => c.challengeId === ch.id && isStillLocked(c, ch.freq),
      );
      const matches = carMatchesChallenge(car, ch);
      if (!alreadyDone && matches) {
        newCompletions.push({
          challengeId: ch.id,
          periodStart: getPeriodStart(ch.freq),
          completedAt: Date.now(),
          bonusScore: ch.bonusScore,
          carMake: car.make,
          carModel: car.model,
        });
        completed.push(ch);
      }
    }

    await persist({
      ...player,
      garage: newGarage,
      completions: newCompletions,
    });
    if (completed.length > 0) setTimeout(() => setPopup(completed[0]), 500);
    setTab("garage");
  };

  // ⚠️ Les hooks DOIVENT être appelés avant tout return conditionnel
  const insets = useSafeAreaInsets();

  // Défis non encore complétés pour la période en cours
  const activeChallenges = CHALLENGES.filter(
    (ch) =>
      !(player?.completions || []).some(
        (c) => c.challengeId === ch.id && isStillLocked(c, ch.freq),
      ),
  );

  if (loading)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={{ color: C.muted, marginTop: 16, fontSize: 13 }}>
          Chargement…
        </Text>
      </View>
    );

  if (!player)
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />
        <OnboardingScreen onDone={createPlayer} />
      </View>
    );

  const score = totalScore(player);

  const TABS = [
    { id: "scan", icon: "📷", label: "Scanner" },
    {
      id: "garage",
      icon: "🏎️",
      label: "Garage",
      badge: (player.garage || []).length,
    },
    { id: "challenge", icon: "🎯", label: "Défis" },
    { id: "shop", icon: "🛍️", label: "Shop" },
    {
      id: "social",
      icon: "🏆",
      label: "Social",
      badge: (player?.friendRequests || []).length || undefined,
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      {/* Header — respecte la status bar Android et le notch iOS */}
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor: C.bg,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 20, marginRight: 8 }}>🏁</Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "900",
                color: C.accent,
                letterSpacing: 1,
                marginRight: 8,
              }}
            >
              CarDrive
            </Text>
            <View
              style={{
                backgroundColor: C.accent,
                borderRadius: 5,
                paddingHorizontal: 5,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{
                  fontSize: 8,
                  fontWeight: "900",
                  color: "#000",
                  letterSpacing: 1,
                }}
              >
                TCG
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 10, color: C.muted }}>
              {player.avatar} {player.name}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: "800", color: C.accent }}>
              ⭐ {score.toLocaleString()}
            </Text>
          </View>
        </View>
      </View>

      {DEMO_MODE && (
        <View style={{ padding: 8, backgroundColor: "#33280e" }}>
          <Text style={{ color: C.accent, fontSize: 11, textAlign: "center" }}>
            DÉMO · Photos non analysées · Achats fictifs
          </Text>
        </View>
      )}
      <TouchableOpacity accessibilityRole="link" accessibilityLabel="Support Gaalster, ouvre le navigateur" onPress={() => Linking.openURL("https://cardrive-tcg-demo.kiki2823.chatgpt.site/support").catch(() => Alert.alert("Support", "Impossible d’ouvrir le navigateur."))} style={{padding:12,backgroundColor:C.surface}}><Text style={{color:C.accent,textAlign:"center",fontSize:14}}>Gaalster · Support (navigateur)</Text></TouchableOpacity>
      {!!accountError && (
        <TouchableOpacity
          onPress={() => setTab("shop")}
          style={{ padding: 10, backgroundColor: C.surface }}
        >
          <Text style={{ color: C.accent, textAlign: "center" }}>
            {accountError} · Ouvrir le compte
          </Text>
        </TouchableOpacity>
      )}
      <Modal visible={rechargeOpen} transparent animationType="fade" onRequestClose={() => setRechargeOpen(false)}>
        <View style={{flex: 1, backgroundColor: "#000b", justifyContent: "center", padding: 24}}>
          <View accessibilityViewIsModal style={{backgroundColor: "#151526", borderRadius: 20, padding: 24, gap: 16}}>
            <Text accessibilityRole="header" style={{color: C.accent, fontSize: 24, fontWeight: "800"}}>Tu as utilisé ton dernier crédit</Text>
            <Text style={{color: "#fff", fontSize: 16}}>Il te reste 0 crédit. Recharge pour continuer à scanner des voitures.</Text>
            {DEMO_MODE && <Text style={{color: C.muted, fontSize: 14}}>Crédits de démonstration : cette recharge est fictive.</Text>}
            <Btn label="Recharger mes crédits" onPress={() => {setRechargeOpen(false); setTab("shop");}} />
            <Btn label="Plus tard" outline onPress={() => setRechargeOpen(false)} />
          </View>
        </View>
      </Modal>
      {/* Screens */}
      <View style={{ flex: 1 }}>
        {tab === "scan" && (
          <ScannerScreen
            onCarFound={addCar}
            fuel={fuel}
            isPremium={entitlements.isPremium}
            onUpgrade={() => setPremium(true)}
            onConsumeFuel={(value) => { applyEntitlements(value); if (!value.isPremium && value.remaining <= 0) setRechargeOpen(true); }}
          />
        )}
        {tab === "shop" && (
          <ShopScreen entitlements={entitlements} onRefresh={refreshAccount} />
        )}
        {tab === "garage" && <GarageScreen player={player} />}
        {tab === "challenge" && (
          <ChallengeScreen player={player} onToggle={() => {}} />
        )}
        {tab === "social" && (
          <SocialScreen player={player} onUpdatePlayer={persist} />
        )}
      </View>

      {/* Bottom nav — respecte la barre de navigation Android et le home indicator iOS */}
      <View
        style={{
          flexDirection: "row",
          borderTopWidth: 1,
          borderTopColor: C.border,
          backgroundColor: "#0d0d1e",
          paddingBottom:
            insets.bottom > 0
              ? insets.bottom
              : Platform.OS === "android"
                ? 8
                : 16,
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => setTab(t.id)}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: 10,
                borderTopWidth: 2,
                borderTopColor: active ? C.accent : "transparent",
              }}
            >
              <View style={{ position: "relative" }}>
                <Text style={{ fontSize: 20 }}>{t.icon}</Text>
                {(t.badge || 0) > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -8,
                      backgroundColor: C.accent,
                      borderRadius: 8,
                      minWidth: 16,
                      height: 16,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 3,
                    }}
                  >
                    <Text
                      style={{ fontSize: 8, fontWeight: "900", color: "#000" }}
                    >
                      {t.badge > 99 ? "99+" : t.badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "700",
                  color: active ? C.accent : "#3a3a5a",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginTop: 3,
                }}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {challengePopup && (
        <ChallengePopup
          challenge={challengePopup}
          onClose={() => setPopup(null)}
        />
      )}
      {showPremium && (
        <Modal
          visible
          animationType="slide"
          onRequestClose={() => setPremium(false)}
        >
          <SafeAreaViewCompat style={{ flex: 1, backgroundColor: C.bg }}>
            <Btn label="Fermer la boutique" onPress={() => setPremium(false)} />
            <ShopScreen
              entitlements={entitlements}
              onRefresh={refreshAccount}
            />
          </SafeAreaViewCompat>
        </Modal>
      )}
    </View>
  );
}

// SafeAreaProvider doit envelopper toute l'app pour que
// useSafeAreaInsets fonctionne correctement sur Android et iOS
export default function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}
