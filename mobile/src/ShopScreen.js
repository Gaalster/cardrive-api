import { DEMO_MODE } from "./config";
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  AppState,
  ActivityIndicator,
  Platform,
} from "react-native";
import { api, setToken } from "./api";

const ALLOW_NATIVE = process.env.EXPO_PUBLIC_ENABLE_NATIVE_CHECKOUT === "true";
const checkoutAllowed = DEMO_MODE || Platform.OS === "web" || ALLOW_NATIVE;
const money = (product) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: product.currency,
  }).format(product.amount / 100);

export function ShopScreen({ entitlements, onRefresh }) {
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [register, setRegister] = useState(false);
  const lock = useRef(false);
  const connected = Boolean(entitlements.email);

  const run = async (action) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    let live = true;
    api("/catalog")
      .then((data) => {
        if (live) setProducts(data.products);
      })
      .catch((error) => {
        if (live) setMessage(error.message);
      });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") onRefresh().catch(() => {});
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [onRefresh]);

  const authenticate = () =>
    run(async () => {
      const data = await api(register ? "/auth/register" : "/auth/login", {
        email: email.trim(),
        password,
      });
      await setToken(data.token);
      setPassword("");
      await onRefresh();
      setMessage("Compte connecté. Tes achats sont associés à ce compte.");
    });

  const openPayment = (product) =>
    run(async () => {
      const data = await api("/checkout", { productId: product.id });
      if (data.demo) {
        await onRefresh();
        setMessage("Achat fictif validé : aucun paiement effectué.");
        return;
      }
      if (!data.url.startsWith("https://checkout.stripe.com/"))
        throw new Error("Adresse de paiement invalide");
      await Linking.openURL(data.url);
      setMessage(
        "Après le paiement, reviens ici et appuie sur « Actualiser mes achats ».",
      );
    });

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>
        CARDRIVE TCG {DEMO_MODE ? "· DÉMO" : ""}
      </Text>
      <Text style={styles.title}>Le stand 🛍️</Text>
      {DEMO_MODE && (
        <Text style={styles.message}>
          Démonstration locale : prix illustratifs, achats fictifs, aucune
          connexion à Stripe.
        </Text>
      )}
      <Text style={styles.description}>
        Recharge tes scans ou prends le CarDrive Pass pour continuer ta
        collection.
      </Text>
      <View style={styles.card}>
        <Text style={styles.heading}>
          {connected ? "Mon compte" : "Ton compte CarDrive"}
        </Text>
        {connected ? (
          <>
            <Text style={styles.text}>{entitlements.email}</Text>
            <Text style={styles.balance}>
              {entitlements.isPremium
                ? "👑 CarDrive Pass actif"
                : `${entitlements.remaining || 0} scans disponibles`}
            </Text>
            <Text style={styles.description}>
              {entitlements.freeRemaining || 0}/5 gratuits aujourd’hui ·{" "}
              {entitlements.credits || 0} scans achetés en réserve
            </Text>
            <Action
              label="Actualiser mes achats"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  await onRefresh();
                  setMessage(
                    "Achats actualisés. Un paiement en cours de confirmation peut prendre quelques instants.",
                  );
                })
              }
            />
            <Action
              label={
                DEMO_MODE
                  ? "Désactiver le Pass fictif"
                  : "Gérer mon abonnement et mes factures"
              }
              disabled={busy}
              secondary
              onPress={() =>
                run(async () => {
                  const data = await api("/portal", {});
                  if (data.demo) {
                    await onRefresh();
                    setMessage("Pass fictif désactivé.");
                    return;
                  }
                  if (!data.url.startsWith("https://billing.stripe.com/"))
                    throw new Error("Adresse invalide");
                  await Linking.openURL(data.url);
                })
              }
            />
            <Action
              label={
                DEMO_MODE ? "Réinitialiser les scans démo" : "Me déconnecter"
              }
              disabled={busy}
              secondary
              onPress={() =>
                run(async () => {
                  if (DEMO_MODE) {
                    await api("/demo/reset", {});
                    await onRefresh();
                    return;
                  }
                  await api("/auth/logout", {});
                  await setToken(null);
                  await onRefresh().catch(() => {});
                })
              }
            />
          </>
        ) : (
          <>
            <Text style={styles.description}>
              Connecte-toi pour scanner et retrouver tes achats sur un autre
              appareil. Ton garage reste sur cet appareil.
            </Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Adresse e-mail"
              placeholderTextColor="#85859c"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Mot de passe (12 caractères minimum)"
              placeholderTextColor="#85859c"
              secureTextEntry
              autoCapitalize="none"
              autoComplete={register ? "new-password" : "current-password"}
            />
            <Action
              label={register ? "Créer mon compte" : "Me connecter"}
              disabled={busy || !email || password.length < 12}
              onPress={authenticate}
            />
            <Action
              label={register ? "J’ai déjà un compte" : "Créer un compte"}
              secondary
              disabled={busy}
              onPress={() => setRegister(!register)}
            />
          </>
        )}
      </View>
      {!!message && (
        <Text accessibilityRole="alert" style={styles.message}>
          {message}
        </Text>
      )}
      {busy && <ActivityIndicator color="#FBBF24" />}
      {!checkoutAllowed && (
        <Text style={styles.message}>
          Les achats dans cette version mobile ne sont pas encore disponibles.
        </Text>
      )}
      {["payment", "subscription"].map((mode) => (
        <View key={mode}>
          <Text style={styles.section}>
            {mode === "payment" ? "Packs de scans" : "CarDrive Pass"}
          </Text>
          {products
            .filter((product) => product.mode === mode)
            .map((product) => (
              <View key={product.id} style={styles.card}>
                <Text style={styles.heading}>{product.name}</Text>
                <Text style={styles.price}>
                  {money(product)}
                  {product.interval === "month"
                    ? " / mois"
                    : product.interval === "year"
                      ? " / an"
                      : ""}
                </Text>
                <Text style={styles.description}>
                  {product.mode === "payment"
                    ? `${product.credits} scans, sans expiration. Les scans gratuits sont utilisés en premier.`
                    : "Scans illimités pendant la durée de l’abonnement. Renouvellement automatique, résiliable depuis ton compte."}
                </Text>
                <Action
                  disabled={
                    busy ||
                    !connected ||
                    !checkoutAllowed ||
                    (mode === "subscription" && entitlements.isPremium)
                  }
                  label={
                    mode === "payment"
                      ? DEMO_MODE
                        ? "Simuler ce pack — gratuit"
                        : "Acheter ce pack"
                      : entitlements.isPremium
                        ? "Pass actif"
                        : DEMO_MODE
                          ? "Simuler ce Pass — gratuit"
                          : "Choisir ce Pass"
                  }
                  onPress={() => openPayment(product)}
                />
              </View>
            ))}
        </View>
      ))}
      {!products.length && (
        <Action
          label="Recharger les offres"
          disabled={busy}
          onPress={() =>
            run(async () => setProducts((await api("/catalog")).products))
          }
        />
      )}
      <Text style={styles.description}>
        {DEMO_MODE
          ? "Les achats démo sont simulés sur cet appareil. Aucun paiement, aucune carte bancaire."
          : "Paiement sécurisé par Stripe. Les achats sont activés après confirmation du paiement. Les codes de réduction se saisissent sur la page de paiement."}
      </Text>
    </ScrollView>
  );
}
function Action({ label, onPress, disabled, secondary }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        secondary && styles.secondary,
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: "#FBBF24" }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#08080f" },
  content: { padding: 20, paddingBottom: 48 },
  eyebrow: {
    color: "#FBBF24",
    letterSpacing: 3,
    fontSize: 10,
    fontWeight: "800",
  },
  title: {
    color: "#f0f0f8",
    fontSize: 32,
    fontWeight: "900",
    marginVertical: 10,
  },
  description: {
    color: "#aaaabe",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  text: { color: "#f0f0f8", fontSize: 14 },
  balance: {
    color: "#FBBF24",
    fontSize: 18,
    marginVertical: 12,
    fontWeight: "700",
  },
  card: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#29293f",
    backgroundColor: "#12121e",
    marginBottom: 16,
  },
  heading: {
    color: "#f0f0f8",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12,
  },
  section: {
    color: "#f0f0f8",
    fontSize: 20,
    fontWeight: "800",
    marginVertical: 16,
  },
  price: {
    color: "#FBBF24",
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 12,
  },
  input: {
    color: "#f0f0f8",
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#08080f",
    marginBottom: 10,
  },
  button: {
    backgroundColor: "#FBBF24",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  secondary: { backgroundColor: "#242019" },
  buttonText: { color: "#08080f", fontWeight: "800", textAlign: "center" },
  message: {
    color: "#FBBF24",
    backgroundColor: "#242019",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    lineHeight: 20,
  },
});
