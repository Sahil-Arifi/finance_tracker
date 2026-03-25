import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import AppTabs from "./components/AppTabs";
import YearOverview from "./components/YearOverview";
import MonthView from "./components/MonthView";
import AnimatedBackdrop from "./components/AnimatedBackdrop";
import LoginScreen from "./components/LoginScreen";
import { AuthProvider } from "./context/AuthProvider";
import { useAuth } from "./hooks/useAuth";
import { db, isFirebaseConfigured } from "./firebase";
import { loadState, saveState } from "./persistence";
import { formatISODate, inMonth, inYear, todayISO } from "./utils/dates";
import "./App.css";

const expenseCategories = ["food", "housing", "utilities", "transport", "entertainment", "other"];
const incomeCategories = ["salary", "freelance", "investment", "gift", "refund", "other"];
const allTransactionCategories = [...new Set([...expenseCategories, ...incomeCategories])];

function AppShell({ children }) {
  return (
    <div className="app-shell">
      <AnimatedBackdrop fixed />
      <div className="app-shell-content">{children}</div>
    </div>
  );
}

function FirebaseConfigBanner() {
  const dev = import.meta.env.DEV;
  return (
    <div className={`firebase-config-banner${dev ? "" : " firebase-config-banner--prod"}`} role="status">
      {dev ? (
        <>
          <strong className="firebase-config-banner-title">Sign-in is off — Firebase env not loaded.</strong>
          <span className="firebase-config-banner-body">
            {" "}
            Create a <code className="firebase-config-code">.env</code> file next to{" "}
            <code className="firebase-config-code">package.json</code> (copy from{" "}
            <code className="firebase-config-code">.env.example</code>), paste your Firebase web config values — names must
            start with <code className="firebase-config-code">VITE_</code> — then stop and run{" "}
            <code className="firebase-config-code">npm run dev</code> again.
          </span>
        </>
      ) : (
        <span className="firebase-config-banner-body">
          This build has no Firebase configuration, so the app runs in offline mode on this device only (no sign-in).
        </span>
      )}
    </div>
  );
}

function financeDocRef(uid) {
  return doc(db, "users", uid, "profile", "finance");
}

function FinanceApp({ cloudUserId = null, userEmail = null, onSignOut = null }) {
  const cloud = Boolean(cloudUserId);
  const [{ transactions, goals, accounts }, setFinance] = useState(() =>
    cloud ? { transactions: [], goals: [], accounts: [] } : loadState()
  );
  const skipSaveRef = useRef(true);
  const hydratedRef = useRef(!cloud);
  const [cloudReady, setCloudReady] = useState(!cloud);

  const [activeTab, setActiveTab] = useState("year");
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(null);
  const userWantsFullMonthRef = useRef(false);

  const yearScrollRef = useRef(0);
  const monthScrollRef = useRef(0);

  const switchTab = useCallback(
    (next) => {
      if (activeTab === "year") yearScrollRef.current = window.scrollY;
      else if (activeTab === "month") monthScrollRef.current = window.scrollY;

      if (next === "month" && activeTab !== "month") {
        userWantsFullMonthRef.current = false;
        setSelectedDate((prev) => {
          if (prev !== null) return prev;
          const t = todayISO();
          return inMonth(t, calendarYear, calendarMonth) ? t : formatISODate(calendarYear, calendarMonth, 1);
        });
      }
      if (next !== "month") {
        userWantsFullMonthRef.current = false;
      }

      setActiveTab(next);
    },
    [activeTab, calendarYear, calendarMonth]
  );

  useEffect(() => {
    if (activeTab !== "month") return;
    if (selectedDate !== null) return;
    if (userWantsFullMonthRef.current) return;
    const t = todayISO();
    setSelectedDate(inMonth(t, calendarYear, calendarMonth) ? t : formatISODate(calendarYear, calendarMonth, 1));
  }, [activeTab, calendarYear, calendarMonth, selectedDate]);

  useLayoutEffect(() => {
    const y = activeTab === "year" ? yearScrollRef.current : monthScrollRef.current;
    window.scrollTo({ top: y, left: 0, behavior: "auto" });
  }, [activeTab]);

  useEffect(() => {
    if (!cloud || !cloudUserId) {
      hydratedRef.current = true;
      return undefined;
    }
    hydratedRef.current = false;
    const ref = financeDocRef(cloudUserId);
    return onSnapshot(ref, async (snap) => {
      skipSaveRef.current = true;
      if (!snap.exists()) {
        const local = loadState();
        const has =
          local.transactions.length > 0 || local.goals.length > 0 || local.accounts.length > 0;
        if (has) {
          await setDoc(ref, {
            transactions: local.transactions,
            goals: local.goals,
            accounts: local.accounts,
          });
          setFinance(local);
        } else {
          setFinance({ transactions: [], goals: [], accounts: [] });
        }
      } else {
        const d = snap.data();
        setFinance({
          transactions: Array.isArray(d.transactions) ? d.transactions : [],
          goals: Array.isArray(d.goals) ? d.goals : [],
          accounts: Array.isArray(d.accounts) ? d.accounts : [],
        });
      }
      hydratedRef.current = true;
      setCloudReady(true);
    });
  }, [cloud, cloudUserId]);

  useEffect(() => {
    if (cloud) return undefined;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return undefined;
    }
    const id = setTimeout(() => saveState({ transactions, goals, accounts }), 280);
    return () => clearTimeout(id);
  }, [cloud, transactions, goals, accounts]);

  useEffect(() => {
    if (!cloud || !cloudUserId) return undefined;
    if (!hydratedRef.current) return undefined;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return undefined;
    }
    const ref = financeDocRef(cloudUserId);
    const id = setTimeout(() => {
      setDoc(
        ref,
        {
          transactions,
          goals,
          accounts,
        },
        { merge: true }
      ).catch(() => {});
    }, 280);
    return () => clearTimeout(id);
  }, [cloud, cloudUserId, transactions, goals, accounts]);

  const setTransactions = useCallback((updater) => {
    setFinance((d) => ({
      ...d,
      transactions: typeof updater === "function" ? updater(d.transactions) : updater,
    }));
  }, []);

  const setGoals = useCallback((updater) => {
    setFinance((d) => ({
      ...d,
      goals: typeof updater === "function" ? updater(d.goals) : updater,
    }));
  }, []);

  const setAccounts = useCallback((updater) => {
    setFinance((d) => ({
      ...d,
      accounts: typeof updater === "function" ? updater(d.accounts) : updater,
    }));
  }, []);

  const yearTransactions = useMemo(
    () => transactions.filter((t) => inYear(t.date, calendarYear)),
    [transactions, calendarYear]
  );

  const monthTransactions = useMemo(
    () => transactions.filter((t) => inMonth(t.date, calendarYear, calendarMonth)),
    [transactions, calendarYear, calendarMonth]
  );

  const listTransactionsMonth = useMemo(() => {
    if (!selectedDate) return monthTransactions;
    return monthTransactions.filter((t) => t.date === selectedDate);
  }, [monthTransactions, selectedDate]);

  const savingsGoalsForYear = useMemo(
    () => goals.filter((g) => g.year === calendarYear && g.kind === "savings"),
    [goals, calendarYear]
  );

  const handleAddTransaction = useCallback(
    (transaction) => {
      setTransactions((prev) => [...prev, transaction]);
    },
    [setTransactions]
  );

  const handleUpdateTransaction = useCallback(
    (id, patch) => {
      setTransactions((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const next = { ...t, ...patch };
          if (patch.goalSplits === undefined) {
            delete next.goalSplits;
          }
          return next;
        })
      );
    },
    [setTransactions]
  );

  const handleDeleteTransaction = useCallback(
    (id) => {
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    },
    [setTransactions]
  );

  const addGoal = useCallback(
    (goal) => {
      setGoals((prev) => [...prev, goal]);
    },
    [setGoals]
  );

  const deleteGoal = useCallback(
    (id) => {
      setGoals((prev) => prev.filter((g) => g.id !== id));
    },
    [setGoals]
  );

  const updateGoal = useCallback(
    (id, patch) => {
      setGoals((prev) =>
        prev.map((g) => {
          if (g.id !== id) return g;
          const next = { ...g, ...patch };
          if (patch.amount !== undefined) {
            const a = Number(patch.amount);
            if (Number.isNaN(a) || a <= 0) return g;
            next.amount = a;
          }
          return next;
        })
      );
    },
    [setGoals]
  );

  const addAccount = useCallback(
    (account) => {
      setAccounts((prev) => [...prev, account]);
    },
    [setAccounts]
  );

  const updateAccount = useCallback(
    (id, patch) => {
      setAccounts((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          const next = { ...a, ...patch };
          if (patch.balance !== undefined) {
            const b = Number(patch.balance);
            if (Number.isNaN(b) || b < 0) return a;
            next.balance = b;
          }
          return next;
        })
      );
    },
    [setAccounts]
  );

  const deleteAccount = useCallback(
    (id) => {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    },
    [setAccounts]
  );

  const onYearDelta = (delta) => {
    setSelectedDate(null);
    setCalendarYear((y) => y + delta);
  };

  const goMonth = (delta) => {
    userWantsFullMonthRef.current = false;
    setSelectedDate(null);
    let y = calendarYear;
    let m = calendarMonth + delta;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    setCalendarYear(y);
    setCalendarMonth(m);
  };

  const openMonthTab = useCallback(
    (month) => {
      userWantsFullMonthRef.current = false;
      setCalendarMonth(month);
      const t = todayISO();
      const y = calendarYear;
      setSelectedDate(inMonth(t, y, month) ? t : formatISODate(y, month, 1));
      switchTab("month");
    },
    [switchTab, calendarYear]
  );

  const switchToMonthTabOnly = useCallback(() => switchTab("month"), [switchTab]);

  if (cloud && !cloudReady) {
    return (
      <AppShell>
        <div className="app app--sync">
          <p className="app-sync-text">Syncing your data…</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="app">
        <header className="app-header">
          <div className="app-header-row">
            <div>
              <h1 className="app-title">Finance Tracker</h1>
              <p className="app-subtitle">Track your income and expenses</p>
            </div>
            {onSignOut ? (
              <div className="auth-bar">
                <span className="auth-email" title={userEmail || ""}>
                  {userEmail || "Signed in"}
                </span>
                <button type="button" className="auth-signout" onClick={onSignOut}>
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <AppTabs activeTab={activeTab} onTabChange={switchTab} />

        {activeTab === "year" && (
          <YearOverview
            year={calendarYear}
            onYearDelta={onYearDelta}
            yearTransactions={yearTransactions}
            goals={goals}
            accounts={accounts}
            onAddGoal={addGoal}
            onUpdateGoal={updateGoal}
            onDeleteGoal={deleteGoal}
            onOpenMonth={openMonthTab}
            categories={expenseCategories}
            onAddAccount={addAccount}
            onUpdateAccount={updateAccount}
            onDeleteAccount={deleteAccount}
            onSwitchToMonthTab={switchToMonthTabOnly}
          />
        )}

        {activeTab === "month" && (
          <MonthView
            year={calendarYear}
            month={calendarMonth}
            onGoMonth={goMonth}
            selectedDate={selectedDate}
            onSelectDate={(iso) => {
              userWantsFullMonthRef.current = false;
              setSelectedDate(iso);
            }}
            onClearDay={() => {
              userWantsFullMonthRef.current = true;
              setSelectedDate(null);
            }}
            monthTransactions={monthTransactions}
            listTransactions={listTransactionsMonth}
            expenseCategories={expenseCategories}
            incomeCategories={incomeCategories}
            allCategories={allTransactionCategories}
            savingsGoals={savingsGoalsForYear}
            onAddTransaction={handleAddTransaction}
            onUpdateTransaction={handleUpdateTransaction}
            onDeleteTransaction={handleDeleteTransaction}
          />
        )}
      </div>
    </AppShell>
  );
}

function CloudShell() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <AppShell>
        <div className="app app--sync">
          <p className="app-sync-text">Loading…</p>
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <FinanceApp
      key={user.uid}
      cloudUserId={user.uid}
      userEmail={user.email}
      onSignOut={() => void signOut()}
    />
  );
}

export default function App() {
  if (!isFirebaseConfigured) {
    return (
      <>
        <FirebaseConfigBanner />
        <FinanceApp />
      </>
    );
  }

  return (
    <AuthProvider>
      <CloudShell />
    </AuthProvider>
  );
}
