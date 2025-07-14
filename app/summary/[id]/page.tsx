"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  FileText,
  Languages,
  Share2,
  Loader2,
  Clock,
  BookOpen,
  Mic,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Chatbot from "@/components/Chatbot";
import { SaveSessionModal } from "@/components/SaveSessionModal";
import { useSession, useUser } from "@clerk/nextjs";
import {
  loadSessionTranscripts,
  type Transcript,
} from "@/lib/transcript-loader";

interface Session {
  id: string;
  title: string;
  description?: string;
  host_name: string;
  host_id: string;
  category: string;
  status: string;
  summary?: string;
  created_at: string;
  ended_at?: string;
}

// Transcript 인터페이스는 lib/transcript-loader.ts에서 import

export default function PublicSessionSummaryPage() {
  const params = useParams();
  const router = useRouter();
  const { session: clerkSession } = useSession();
  const supabase = createClient(clerkSession?.getToken() ?? Promise.resolve(null));
  const sessionId = params.id as string;
  const { user } = useUser();

  // 페이지 로드 시 디버깅 정보 및 URL 정리
  useEffect(() => {
    console.log("📄 Summary page loaded:", {
      sessionId,
      hasUser: !!user,
      userId: user?.id,
      currentUrl: window.location.href,
      pendingSession:
        localStorage.getItem("pendingSessionSave") ||
        sessionStorage.getItem("pendingSessionSave"),
    });

    // URL에서 OAuth 관련 파라미터 제거
    const url = new URL(window.location.href);
    let needsCleanup = false;

    if (url.searchParams.has("code")) {
      console.log("🧹 Removing code parameter from URL");
      url.searchParams.delete("code");
      needsCleanup = true;
    }

    if (url.searchParams.has("login_success")) {
      console.log("🎉 Login success detected, will trigger session save");
      url.searchParams.delete("login_success");
      needsCleanup = true;
    }

    if (needsCleanup) {
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const [session, setSession] = useState<Session | null>(null);
  const [transcript, setTranscript] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState([16]);
  const [darkMode, setDarkMode] = useState(false);
  const [showFullTranscript, setShowFullTranscript] = useState(false);

  // 다국어 요약 관련 상태
  const [summary, setSummary] = useState<string>("");
  const [userLanguage, setUserLanguage] = useState("en");
  const [summaryLoading, setSummaryLoading] = useState(false);

  // 번역 기능 상태
  const [showTranslation, setShowTranslation] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("ko");
  const [translatedSummary, setTranslatedSummary] = useState<string>("");
  const [summaryTranslating, setSummaryTranslating] = useState(false);

  // 🆕 Transcript 번역 상태
  const [translatedTexts, setTranslatedTexts] = useState<
    Record<string, string>
  >({});
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());

  // 🆕 세션 저장 모달 상태
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);

  // 카테고리 아이콘 매핑
  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      sports: "⚽",
      economics: "💰",
      technology: "💻",
      education: "📚",
      business: "🏢",
      medical: "🏥",
      legal: "⚖️",
      entertainment: "🎬",
      science: "🔬",
      general: "📋",
    };
    return icons[category] || "📋";
  };

  // 지원 언어 목록
  const languages = [
    { code: "ko", name: "Korean", flag: "🇰🇷" },
    { code: "zh", name: "Chinese", flag: "🇨🇳" },
    { code: "hi", name: "Hindi", flag: "🇮🇳" },
    { code: "en", name: "English", flag: "🇺🇸" },
  ];

  const getCategoryName = (category: string) => {
    const names: Record<string, Record<string, string>> = {
      en: {
        sports: "Sports",
        economics: "Economics",
        technology: "Technology",
        education: "Education",
        business: "Business",
        medical: "Medical",
        legal: "Legal",
        entertainment: "Entertainment",
        science: "Science",
        general: "General",
      },
      ko: {
        sports: "스포츠",
        economics: "경제",
        technology: "기술",
        education: "교육",
        business: "비즈니스",
        medical: "의료",
        legal: "법률",
        entertainment: "엔터테인먼트",
        science: "과학",
        general: "일반",
      },
      zh: {
        sports: "体育",
        economics: "经济",
        technology: "技术",
        education: "教育",
        business: "商业",
        medical: "医疗",
        legal: "法律",
        entertainment: "娱乐",
        science: "科学",
        general: "一般",
      },
      hi: {
        sports: "खेल",
        economics: "अर्थशास्त्र",
        technology: "प्रौद्योगिकी",
        education: "शिक्षा",
        business: "व्यापार",
        medical: "चिकित्सा",
        legal: "कानूनी",
        entertainment: "मनोरंजन",
        science: "विज्ञान",
        general: "सामान्य",
      },
    };
    return (
      names[userLanguage]?.[category] || names["en"][category] || "General"
    );
  };

  // 다국어 텍스트
  const t = (key: string) => {
    const texts: Record<string, Record<string, string>> = {
      en: {
        sessionSummary: "Session Summary",
        completedSession: "Completed Session",
        inProgress: "In Progress",
        sessionTime: "Session Duration",
        transcriptCount: "Transcript Count",
        wordCount: "Word Count",
        aiSummary: "AI Summary",
        categoryBasedSummary: "Category-based Summary",
        generatedBy: "Generated by Gemini 2.0",
        characters: "characters",
        copySummary: "Copy Summary",
        regenerate: "Regenerate",
        fullTranscript: "Full Transcript",
        realTimeResults: "Real-time speech recognition results",
        expand: "Expand",
        collapse: "Collapse",
        copyAllTranscript: "Copy All Transcript",
        publicAccess:
          "This page is accessible to anyone. Share the link to share session content with others.",
        poweredBy:
          "Powered by LiveTranscribe • Real-time Speech Recognition & AI Summary",
        fontSize: "Font Size",
        darkMode: "Dark Mode",
        share: "Share",
        back: "Back",
        sessionNotFound: "Session not found",
        loadingSession: "Loading session information...",
        goHome: "Go Home",
        items: "items",
        words: "words",
        minutes: "minutes",
      },
      ko: {
        sessionSummary: "세션 요약",
        completedSession: "완료된 세션",
        inProgress: "진행 중",
        sessionTime: "세션 시간",
        transcriptCount: "발언 수",
        wordCount: "단어 수",
        aiSummary: "AI 요약",
        categoryBasedSummary: "분야 맞춤 요약",
        generatedBy: "Gemini 2.0으로 생성",
        characters: "글자",
        copySummary: "요약 복사",
        regenerate: "재생성",
        fullTranscript: "전체 발언 기록",
        realTimeResults: "실시간 음성 인식 결과",
        expand: "펼치기",
        collapse: "접기",
        copyAllTranscript: "전체 발언 복사",
        publicAccess:
          "이 페이지는 누구나 접근할 수 있습니다. 링크를 공유하여 다른 사람들과 세션 내용을 나눠보세요.",
        poweredBy: "Powered by LiveTranscribe • 실시간 음성 인식 및 AI 요약",
        fontSize: "글자 크기",
        darkMode: "다크 모드",
        share: "공유",
        back: "뒤로가기",
        sessionNotFound: "세션을 찾을 수 없습니다",
        loadingSession: "세션 정보를 불러오는 중...",
        goHome: "홈으로 돌아가기",
        items: "개",
        words: "개",
        minutes: "분",
      },
      zh: {
        sessionSummary: "会话摘要",
        completedSession: "已完成会话",
        inProgress: "进行中",
        sessionTime: "会话时长",
        transcriptCount: "发言数量",
        wordCount: "词数",
        aiSummary: "AI 摘要",
        categoryBasedSummary: "基于类别的摘要",
        generatedBy: "由 Gemini 2.0 生成",
        characters: "字符",
        copySummary: "复制摘要",
        regenerate: "重新生成",
        fullTranscript: "完整记录",
        realTimeResults: "实时语音识别结果",
        expand: "展开",
        collapse: "收起",
        copyAllTranscript: "复制全部记录",
        publicAccess: "此页面任何人都可以访问。分享链接与他人共享会话内容。",
        poweredBy: "Powered by LiveTranscribe • 实时语音识别和 AI 摘要",
        fontSize: "字体大小",
        darkMode: "深色模式",
        share: "分享",
        back: "返回",
        sessionNotFound: "未找到会话",
        loadingSession: "正在加载会话信息...",
        goHome: "回到首页",
        items: "个",
        words: "个",
        minutes: "分钟",
      },
      hi: {
        sessionSummary: "सत्र सारांश",
        completedSession: "पूर्ण सत्र",
        inProgress: "प्रगति में",
        sessionTime: "सत्र समय",
        transcriptCount: "भाषण संख्या",
        wordCount: "शब्द संख्या",
        aiSummary: "AI सारांश",
        categoryBasedSummary: "श्रेणी आधारित सारांश",
        generatedBy: "Gemini 2.0 द्वारा उत्पन्न",
        characters: "वर्ण",
        copySummary: "सारांश कॉपी करें",
        regenerate: "पुनर्जनन",
        fullTranscript: "पूर्ण प्रतिलेख",
        realTimeResults: "वास्तविक समय भाषण पहचान परिणाम",
        expand: "विस्तार",
        collapse: "संक्षिप्त",
        copyAllTranscript: "सभी प्रतिलेख कॉपी करें",
        publicAccess:
          "यह पृष्ठ किसी के लिए भी सुलभ है। लिंक साझा करके दूसरों के साथ सत्र सामग्री साझा करें।",
        poweredBy:
          "Powered by LiveTranscribe • वास्तविक समय भाषण पहचान और AI सारांश",
        fontSize: "फ़ॉन्ट आकार",
        darkMode: "डार्क मोड",
        share: "साझा करें",
        back: "वापस",
        sessionNotFound: "सत्र नहीं मिला",
        loadingSession: "सत्र जानकारी लोड हो रही है...",
        goHome: "होम पर जाएं",
        items: "",
        words: "",
        minutes: "मिनट",
      },
    };
    return texts[userLanguage]?.[key] || texts["en"][key] || key;
  };

  // 사용자 언어 감지
  useEffect(() => {
    const detectLanguage = () => {
      if (typeof window !== "undefined") {
        const browserLang = navigator.language.split("-")[0];
        const supportedLangs = ["ko", "zh", "hi", "en"];
        setUserLanguage(
          supportedLangs.includes(browserLang) ? browserLang : "en"
        );
      }
    };
    detectLanguage();
  }, []);

  // 🆕 요약 번역 함수 (새로운 캐시 시스템 사용)
  const translateSummaryPublic = async (
    summaryText: string,
    targetLang: string
  ) => {
    if (!summaryText || targetLang === "en") {
      setTranslatedSummary(summaryText);
      return;
    }

    setSummaryTranslating(true);

    try {
      // session_summary_cache에서 번역된 요약 찾기
      const { data: cachedSummary, error } = await supabase
        .from("session_summary_cache")
        .select("summary_text")
        .eq("session_id", sessionId)
        .eq("language_code", targetLang)
        .maybeSingle();

      if (error) {
        console.error("Error loading summary translation:", error);
        setTranslatedSummary(summaryText); // 실패 시 영어 원문 표시
      } else if (cachedSummary) {
        setTranslatedSummary(cachedSummary.summary_text);
        console.log(`✅ Loaded ${targetLang} summary translation from cache`);
      } else {
        console.log(
          `⚠️ No ${targetLang} summary translation found, using original`
        );
        setTranslatedSummary(summaryText);
      }
    } catch (error) {
      console.error("Error loading summary translation:", error);
      setTranslatedSummary(summaryText);
    } finally {
      setSummaryTranslating(false);
    }
  };

  // 🆕 Transcript 번역 함수 (기존 translation_cache 사용)
  const translateText = async (
    text: string,
    targetLang: string
  ): Promise<string> => {
    try {
      console.log(
        `🌍 Loading translation: "${text.substring(0, 30)}..." → ${targetLang}`
      );

      // translation_cache에서 기존 번역 찾기
      const { data: cachedTranslation, error } = await supabase
        .from("translation_cache")
        .select("translated_text")
        .eq("original_text", text)
        .eq("target_language", targetLang)
        .maybeSingle();

      if (error) {
        console.error("Translation cache error:", error);
        return `[번역 실패] ${text}`;
      }

      if (cachedTranslation) {
        console.log(`✅ Found cached translation`);
        return cachedTranslation.translated_text;
      } else {
        console.log(`⚠️ No cached translation found`);
        return `[${targetLang}] ${text}`; // 번역이 없으면 원문 표시
      }
    } catch (error) {
      console.error("Translation error:", error);
      return `[번역 실패] ${text}`;
    }
  };

  // 🆕 요약 번역 로드 함수 (새로운 캐시 시스템 사용)
  const loadSummaryTranslation = async (
    englishSummary: string,
    targetLang: string
  ) => {
    if (!englishSummary || targetLang === "en") {
      setSummary(englishSummary || "");
      return;
    }

    setSummaryLoading(true);

    try {
      // session_summary_cache에서 번역된 요약 찾기
      const { data: cachedSummary, error } = await supabase
        .from("session_summary_cache")
        .select("summary_text")
        .eq("session_id", sessionId)
        .eq("language_code", targetLang)
        .maybeSingle();

      if (error) {
        console.error("Error loading summary translation:", error);
        setSummary(englishSummary); // 실패 시 영어 원문 표시
      } else if (cachedSummary) {
        setSummary(cachedSummary.summary_text);
        console.log(`✅ Loaded ${targetLang} summary translation from cache`);
      } else {
        console.log(`⚠️ No ${targetLang} translation found, showing English`);
        setSummary(englishSummary);
      }
    } catch (error) {
      console.error("Error loading summary translation:", error);
      setSummary(englishSummary);
    } finally {
      setSummaryLoading(false);
    }
  };

  // 세션 및 transcript 데이터 로드
  useEffect(() => {
    const loadSessionData = async () => {
      if (!sessionId) return;

      try {
        setLoading(true);
        setError(null);

        // 세션 정보 로드 (공개 접근)
        const { data: sessionData, error: sessionError } = await supabase
          .from("sessions")
          .select(
            "id, title, description, host_name, host_id, category, status, summary, created_at, ended_at"
          )
          .eq("id", sessionId)
          .single();

        if (sessionError) {
          if (sessionError.code === "PGRST116") {
            throw new Error("세션을 찾을 수 없습니다.");
          }
          throw sessionError;
        }

        setSession(sessionData);

        // transcript 로드 (모듈화된 함수 사용)
        try {
          const transcripts = await loadSessionTranscripts(sessionId, clerkSession?.getToken() ?? Promise.resolve(null));
          setTranscript(transcripts);
          console.log("✅ Transcript loaded successfully:", {
            count: transcripts.length,
            sessionId,
            sessionStatus: sessionData.status,
            samples: transcripts.slice(0, 2).map((t) => ({
              id: t.id,
              textPreview: t.original_text.substring(0, 50) + "...",
              createdAt: t.created_at,
            })),
          });
        } catch (transcriptError) {
          console.error("❌ Transcript loading failed:", {
            error: transcriptError,
            sessionId,
            sessionStatus: sessionData.status,
            errorMessage:
              transcriptError instanceof Error
                ? transcriptError.message
                : "Unknown error",
          });
          // transcript 에러는 무시하고 계속 진행
          setTranscript([]);
        }

        // 요약 번역 로드
        await loadSummaryTranslation(sessionData.summary, userLanguage);
      } catch (error) {
        console.error("Error loading session data:", error);
        setError(error instanceof Error ? error.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    loadSessionData();
  }, [sessionId, supabase]);

  // 언어 변경 시 요약 재로드 (자동)
  useEffect(() => {
    if (session?.summary) {
      loadSummaryTranslation(session.summary, userLanguage);
    }
  }, [userLanguage, session?.summary]);

  // 🆕 Transcript 상태 디버깅
  useEffect(() => {
    console.log("🔍 Transcript state changed:", {
      length: transcript.length,
      sessionId,
      sampleItems: transcript
        .slice(0, 2)
        .map((t) => ({ id: t.id, text: t.original_text.substring(0, 50) })),
    });
  }, [transcript, sessionId]);

  // 🆕 자동 모달 표시 제거 - 사용자가 버튼 클릭 시에만 표시

  // 🆕 호스트인 경우 저장 모달 자동 닫기
  useEffect(() => {
    if (user && session?.host_id === user.id) {
      setShowSaveModal(false);
      console.log("🎤 Host detected, hiding save modal");
    }
  }, [user, session?.host_id]);

  // 🆕 로그인 후 세션 저장 처리
  useEffect(() => {
    const handlePostLoginSave = async () => {
      console.log("🔄 Post-login check:", {
        hasUser: !!user,
        sessionSaved,
        currentSessionId: sessionId,
        currentUrl: window.location.href,
        hasLoginSuccess: window.location.href.includes("login_success=true"),
      });

      // 로그인 성공 플래그가 있거나 사용자가 로그인된 상태에서 세션 저장 처리
      if (user && !sessionSaved) {
        // localStorage와 sessionStorage에서 저장 대기 중인 세션 정보 확인
        const pendingSession =
          localStorage.getItem("pendingSessionSave") ||
          sessionStorage.getItem("pendingSessionSave");
        console.log(
          "📦 Pending session data (localStorage):",
          localStorage.getItem("pendingSessionSave")
        );
        console.log(
          "📦 Pending session data (sessionStorage):",
          sessionStorage.getItem("pendingSessionSave")
        );

        if (pendingSession) {
          try {
            const { sessionId: pendingSessionId, returnUrl } =
              JSON.parse(pendingSession);

            console.log("🔄 Post-login processing:", {
              pendingSessionId,
              currentSessionId: sessionId,
              returnUrl,
              currentUrl: window.location.href,
              matches: pendingSessionId === sessionId,
            });

            if (pendingSessionId === sessionId) {
              console.log("🔄 Processing pending session save after login");

              try {
                await saveSessionForUser(user.id, sessionId);

                // 두 저장소 모두 정리
                localStorage.removeItem("pendingSessionSave");
                sessionStorage.removeItem("pendingSessionSave");

                setSessionSaved(true);
                setShowSaveModal(false);

                console.log("✅ Session save completed successfully");

                // 성공 알림을 더 나은 UI로 표시
                setTimeout(() => {
                  const toast = document.createElement("div");
                  toast.innerHTML = `
                    <div style="
                      position: fixed;
                      top: 20px;
                      right: 20px;
                      background: #10b981;
                      color: white;
                      padding: 16px 20px;
                      border-radius: 8px;
                      font-size: 14px;
                      font-weight: 500;
                      z-index: 9999;
                      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                      animation: slideIn 0.3s ease-out;
                    ">
                      ✅ 세션이 성공적으로 저장되었습니다!
                    </div>
                  `;

                  const style = document.createElement("style");
                  style.textContent = `
                    @keyframes slideIn {
                      from { transform: translateX(100%); opacity: 0; }
                      to { transform: translateX(0); opacity: 1; }
                    }
                  `;
                  document.head.appendChild(style);
                  document.body.appendChild(toast);

                  setTimeout(() => {
                    toast.remove();
                    style.remove();
                  }, 4000);
                }, 500);
              } catch (saveError) {
                console.error("❌ Session save failed:", saveError);
                alert(
                  "세션 저장에 실패했습니다: " +
                    (saveError instanceof Error
                      ? saveError.message
                      : "Unknown error")
                );
              }
            } else {
              console.log("⚠️ Session ID mismatch, not processing save");
            }
          } catch (error) {
            console.error("Error processing pending session save:", error);
            // 에러 알림
            alert(
              "세션 저장 중 오류가 발생했습니다: " +
                (error instanceof Error ? error.message : "Unknown error")
            );
          }
        } else {
          console.log("📦 No pending session save found");
        }
      }
    };

    // 로그인 후 처리를 위한 딜레이 추가
    const timer = setTimeout(handlePostLoginSave, 200);
    return () => clearTimeout(timer);
  }, [user, sessionId, sessionSaved]);

  // 🆕 세션 저장 함수
  const saveSessionForUser = async (userId: string, sessionId: string) => {
    try {
      // 호스트인지 확인
      const isHost = session?.host_id === userId;
      const role = isHost ? "host" : "audience";

      console.log(`💾 Saving session for user ${userId} as ${role}`);

      const response = await fetch(`/api/session/${sessionId}/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          role,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("Session saved:", result);
        return result;
      } else {
        const errorData = await response.json();
        console.error("Session save error:", errorData);
        throw new Error(errorData.error || "Failed to save session");
      }
    } catch (error) {
      console.error("Error saving session:", error);
      throw error;
    }
  };

  // 번역 토글 시 요약 번역 실행
  useEffect(() => {
    if (session?.summary && showTranslation) {
      translateSummaryPublic(session.summary, selectedLanguage);
    } else if (session?.summary) {
      setTranslatedSummary(session.summary); // 번역 비활성화 시 원문 표시
    }
  }, [session?.summary, selectedLanguage, showTranslation]);

  // 🆕 Transcript 번역 활성화/언어 변경시 번역 수행
  useEffect(() => {
    if (!showTranslation) {
      setTranslatedTexts({});
      setTranslatingIds(new Set());
      return;
    }

    const translateAllTexts = async () => {
      console.log(
        `🔄 Starting batch translation for ${transcript.length} items`
      );
      setTranslatingIds(new Set(transcript.map((t) => t.id)));

      const newTranslatedTexts: Record<string, string> = {};

      // 병렬로 번역 (최대 3개씩)
      for (let i = 0; i < transcript.length; i += 3) {
        const batch = transcript.slice(i, i + 3);

        await Promise.all(
          batch.map(async (item) => {
            try {
              const translated = await translateText(
                item.original_text,
                selectedLanguage
              );
              newTranslatedTexts[item.id] = translated;

              // 개별 완료시마다 UI 업데이트
              setTranslatedTexts((prev) => ({
                ...prev,
                [item.id]: translated,
              }));
              setTranslatingIds((prev) => {
                const newSet = new Set(prev);
                newSet.delete(item.id);
                return newSet;
              });
            } catch (error) {
              console.error(`Translation failed for ${item.id}:`, error);
              setTranslatingIds((prev) => {
                const newSet = new Set(prev);
                newSet.delete(item.id);
                return newSet;
              });
            }
          })
        );

        // 배치 간 짧은 딜레이
        if (i + 3 < transcript.length) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      console.log(`✅ Batch translation completed`);
    };

    if (transcript.length > 0) {
      translateAllTexts();
    }
  }, [showTranslation, selectedLanguage, transcript]);

  // 텍스트 복사 기능
  const copyText = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      const successMessage =
        userLanguage === "ko"
          ? `${type}이(가) 클립보드에 복사되었습니다.`
          : userLanguage === "zh"
          ? `${type}已复制到剪贴板`
          : userLanguage === "hi"
          ? `${type} क्लिपबोर्ड में कॉपी किया गया`
          : `${type} copied to clipboard`;
      alert(successMessage);
    } catch (error) {
      console.error("Copy failed:", error);
      const errorMessage =
        userLanguage === "ko"
          ? "복사에 실패했습니다."
          : userLanguage === "zh"
          ? "复制失败"
          : userLanguage === "hi"
          ? "कॉपी करने में विफल"
          : "Copy failed";
      alert(errorMessage);
    }
  };

  // 링크 복사 기능
  const copyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      const successMessage =
        userLanguage === "ko"
          ? "링크가 클립보드에 복사되었습니다!"
          : userLanguage === "zh"
          ? "链接已复制到剪贴板！"
          : userLanguage === "hi"
          ? "लिंक क्लिपबोर्ड में कॉपी किया गया!"
          : "Link copied to clipboard!";

      // Toast 알림 (간단한 브라우저 알림으로 대체)
      if (typeof window !== "undefined") {
        // 간단한 toast 스타일 알림
        const toast = document.createElement("div");
        toast.textContent = successMessage;
        toast.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: #10b981;
          color: white;
          padding: 12px 20px;
          border-radius: 8px;
          font-size: 14px;
          z-index: 9999;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          animation: slideIn 0.3s ease-out;
        `;

        // CSS 애니메이션 추가
        const style = document.createElement("style");
        style.textContent = `
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `;
        document.head.appendChild(style);
        document.body.appendChild(toast);

        // 3초 후 제거
        setTimeout(() => {
          toast.remove();
          style.remove();
        }, 3000);
      }
    } catch (error) {
      console.error("Copy failed:", error);
      const errorMessage =
        userLanguage === "ko"
          ? "복사에 실패했습니다."
          : userLanguage === "zh"
          ? "复制失败"
          : userLanguage === "hi"
          ? "कॉपी करने में विफल"
          : "Copy failed";
      alert(errorMessage);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-600">{t("loadingSession")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <FileText className="h-8 w-8 text-red-600" />
          <p className="text-gray-900 font-medium">{t("sessionNotFound")}</p>
          <p className="text-gray-600 text-sm text-center">{error}</p>
          <Button onClick={() => router.push("/")} variant="outline">
            {t("goHome")}
          </Button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">{t("sessionNotFound")}</p>
      </div>
    );
  }

  const formatDuration = () => {
    if (!session.created_at || !session.ended_at) return "N/A";
    const start = new Date(session.created_at);
    const end = new Date(session.ended_at);
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000 / 60);
    return `${duration}${t("minutes")}`;
  };

  return (
    <div
      className={`min-h-screen ${darkMode ? "dark bg-gray-900" : "bg-gray-50"}`}
    >
      {/* Header */}
      <header
        className={`border-b sticky top-0 z-40 ${
          darkMode ? "bg-gray-800 border-gray-700" : "bg-white"
        }`}
      >
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="pl-0 pr-2 -ml-2"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("back")}
              </Button>
              <div>
                <h1
                  className={`text-lg font-semibold ${
                    darkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {session.title}
                </h1>
                <p
                  className={`text-sm ${
                    darkMode ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  {t("sessionSummary")} • {session.host_name}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {/* 🆕 세션 저장 버튼 (호스트가 아닌 모든 사용자에게 표시) */}
              {!sessionSaved && (!user || session?.host_id !== user.id) && (
                <Button
                  onClick={() => setShowSaveModal(true)}
                  variant="outline"
                  size="sm"
                  className="flex items-center space-x-2 bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                >
                  <BookOpen className="h-4 w-4" />
                  <span>세션 저장</span>
                </Button>
              )}
              {/* 호스트 표시 */}
              {user && session?.host_id === user.id && (
                <div className="flex items-center space-x-2 text-blue-600 text-sm">
                  <Mic className="h-4 w-4" />
                  <span>호스트</span>
                </div>
              )}

              {sessionSaved && (
                <div className="flex items-center space-x-2 text-green-600 text-sm">
                  <BookOpen className="h-4 w-4" />
                  <span>저장됨</span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTranslation(!showTranslation)}
                className="flex items-center space-x-2"
              >
                <Languages className="h-4 w-4" />
                <span>{showTranslation ? "Hide" : "Show"} Translation</span>
              </Button>
              <Button variant="outline" size="sm" onClick={copyLink}>
                <Share2 className="h-4 w-4 mr-2" />
                Copy Link
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Settings */}
      <div
        className={`border-b ${
          darkMode ? "bg-gray-800 border-gray-700" : "bg-white"
        } p-4`}
      >
        <div className="container mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              {/* Translation Settings */}
              {showTranslation && (
                <div className="flex items-center space-x-2">
                  <Label
                    className={`text-sm ${
                      darkMode ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    Language:
                  </Label>
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className={`px-2 py-1 rounded border text-sm ${
                      darkMode
                        ? "bg-gray-700 border-gray-600 text-white"
                        : "bg-white border-gray-300 text-gray-900"
                    }`}
                  >
                    {languages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.flag} {lang.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Label
                  className={`text-sm ${
                    darkMode ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {t("fontSize")}: {fontSize[0]}px
                </Label>
                <Slider
                  value={fontSize}
                  onValueChange={setFontSize}
                  max={24}
                  min={12}
                  step={2}
                  className="w-24"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="darkMode"
                  checked={darkMode}
                  onChange={(e) => setDarkMode(e.target.checked)}
                  className="rounded"
                />
                <Label
                  htmlFor="darkMode"
                  className={`text-sm ${
                    darkMode ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {t("darkMode")}
                </Label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Session Info */}
          <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className={`p-2 size-11 aspect-square flex items-center justify-center rounded-full ${
                      darkMode
                        ? "bg-blue-900 text-blue-300"
                        : "bg-blue-100 text-blue-600"
                    }`}
                  >
                    <span className="text-lg">
                      {getCategoryIcon(session.category)}
                    </span>
                  </div>
                  <div>
                    <CardTitle
                      className={darkMode ? "text-white" : "text-gray-900"}
                    >
                      {session.title}
                    </CardTitle>
                    <CardDescription
                      className={darkMode ? "text-gray-400" : "text-gray-600"}
                    >
                      {getCategoryName(session.category)} • {session.host_name}
                    </CardDescription>
                  </div>
                </div>
                <div
                  className={`text-sm ${
                    darkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {session.status === "ended"
                    ? t("completedSession")
                    : t("inProgress")}
                </div>
              </div>
            </CardHeader>
            {session.description && (
              <CardContent>
                <p
                  className={`${darkMode ? "text-gray-300" : "text-gray-700"}`}
                  style={{ fontSize: `${fontSize[0]}px` }}
                >
                  {session.description}
                </p>
              </CardContent>
            )}
          </Card>

          {/* Session Stats */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
              <CardContent className="p-4 text-center">
                <Clock
                  className={`h-6 w-6 mx-auto mb-2 ${
                    darkMode ? "text-blue-400" : "text-blue-600"
                  }`}
                />
                <p
                  className={`text-sm ${
                    darkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("sessionTime")}
                </p>
                <p
                  className={`font-semibold ${
                    darkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {formatDuration()}
                </p>
              </CardContent>
            </Card>
            <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
              <CardContent className="p-4 text-center">
                <FileText
                  className={`h-6 w-6 mx-auto mb-2 ${
                    darkMode ? "text-green-400" : "text-green-600"
                  }`}
                />
                <p
                  className={`text-sm ${
                    darkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("transcriptCount")}
                </p>
                <p
                  className={`font-semibold ${
                    darkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {transcript.length}
                  {t("items")}
                </p>
              </CardContent>
            </Card>
            <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
              <CardContent className="p-4 text-center">
                <Languages
                  className={`h-6 w-6 mx-auto mb-2 ${
                    darkMode ? "text-purple-400" : "text-purple-600"
                  }`}
                />
                <p
                  className={`text-sm ${
                    darkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("wordCount")}
                </p>
                <p
                  className={`font-semibold ${
                    darkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {transcript.reduce(
                    (total, t) => total + t.original_text.split(" ").length,
                    0
                  )}
                  {t("words")}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Summary Section */}
          {(session.summary || summary) && (
            <Card
              className={`${
                darkMode ? "bg-gray-800 border-gray-700" : ""
              } border-2 border-dashed ${
                darkMode ? "border-blue-600" : "border-blue-200"
              }`}
            >
              <CardHeader>
                <CardTitle
                  className={`flex items-center space-x-2 ${
                    darkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  <FileText className="h-5 w-5" />
                  <span>{t("aiSummary")}</span>
                </CardTitle>
                <CardDescription
                  className={darkMode ? "text-gray-400" : "text-gray-600"}
                >
                  {getCategoryIcon(session.category)}{" "}
                  {getCategoryName(session.category)}{" "}
                  {t("categoryBasedSummary")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
                    <span
                      className={darkMode ? "text-gray-300" : "text-gray-700"}
                    >
                      Loading {userLanguage} translation...
                    </span>
                  </div>
                ) : (
                  <>
                    {summaryTranslating && (
                      <div className="flex items-center space-x-2 mb-2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        <span
                          className={`text-sm ${
                            darkMode ? "text-gray-400" : "text-gray-600"
                          }`}
                        >
                          Translating summary to{" "}
                          {
                            languages.find((l) => l.code === selectedLanguage)
                              ?.name
                          }
                          ...
                        </span>
                      </div>
                    )}
                    <div
                      className={`leading-relaxed mb-4 ${
                        darkMode ? "text-gray-100" : "text-gray-800"
                      }`}
                      style={{ fontSize: `${fontSize[0]}px` }}
                    >
                      {(() => {
                        if (showTranslation && selectedLanguage !== "en") {
                          return (
                            <span
                              dangerouslySetInnerHTML={{
                                __html:
                                  translatedSummary || session.summary || "",
                              }}
                            />
                          );
                        }
                        return (
                          <span
                            dangerouslySetInnerHTML={{
                              __html: summary || session.summary || "",
                            }}
                          />
                        );
                      })()}
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-600">
                      <div
                        className={`text-xs ${
                          darkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        {t("generatedBy")} •{" "}
                        {(() => {
                          if (showTranslation && selectedLanguage !== "en") {
                            return (translatedSummary || session.summary || "")
                              .length;
                          }
                          return (summary || session.summary || "").length;
                        })()}{" "}
                        {t("characters")}
                        {showTranslation &&
                          selectedLanguage !== "en" &&
                          translatedSummary && (
                            <span>
                              {" "}
                              • Translated to{" "}
                              {
                                languages.find(
                                  (l) => l.code === selectedLanguage
                                )?.name
                              }
                            </span>
                          )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const summaryToCopy = (() => {
                            if (showTranslation && selectedLanguage !== "en") {
                              return translatedSummary || session.summary || "";
                            }
                            return summary || session.summary || "";
                          })();
                          copyText(summaryToCopy, t("copySummary"));
                        }}
                      >
                        📋 {t("copySummary")}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Transcript Section */}
          <Card className={darkMode ? "bg-gray-800 border-gray-700" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle
                  className={darkMode ? "text-white" : "text-gray-900"}
                >
                  {t("fullTranscript")}
                </CardTitle>
                {transcript.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFullTranscript(!showFullTranscript)}
                  >
                    {showFullTranscript ? t("collapse") : t("expand")}
                  </Button>
                )}
              </div>
              <CardDescription
                className={darkMode ? "text-gray-400" : "text-gray-600"}
              >
                {transcript.length}
                {t("items")} • {t("realTimeResults")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transcript.length > 0 ? (
                <>
                  {showFullTranscript && (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {transcript.map((item, index) => (
                        <div
                          key={item.id}
                          className={`p-3 rounded-lg ${
                            darkMode ? "bg-gray-700" : "bg-gray-50"
                          }`}
                        >
                          <div
                            className={`text-xs mb-1 ${
                              darkMode ? "text-gray-400" : "text-gray-500"
                            }`}
                          >
                            #{index + 1} •{" "}
                            {new Date(item.created_at).toLocaleTimeString()}
                          </div>
                          <div
                            className={`${
                              darkMode ? "text-gray-100" : "text-gray-900"
                            }`}
                            style={{ fontSize: `${fontSize[0]}px` }}
                          >
                            {item.original_text}
                          </div>

                          {/* 🆕 Translation Display */}
                          {showTranslation && (
                            <div
                              className={`mt-2 leading-relaxed italic pl-4 border-l-2 ${
                                darkMode
                                  ? "text-gray-300 border-gray-600"
                                  : "text-gray-700 border-gray-300"
                              }`}
                              style={{ fontSize: `${fontSize[0] - 1}px` }}
                            >
                              {translatingIds.has(item.id) ? (
                                <span className="text-gray-400 flex items-center">
                                  <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                                  [AI 번역 중...]
                                </span>
                              ) : (
                                translatedTexts[item.id] ||
                                `[${
                                  languages.find(
                                    (l) => l.code === selectedLanguage
                                  )?.name
                                }] ${item.original_text}`
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {transcript.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyText(
                            transcript
                              .map((t, i) => `${i + 1}. ${t.original_text}`)
                              .join("\n\n"),
                            t("copyAllTranscript")
                          )
                        }
                      >
                        📋 {t("copyAllTranscript")}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div
                  className={`text-center py-8 ${
                    darkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">
                    {session?.status === "ended"
                      ? "Transcript not available"
                      : "No transcript yet"}
                  </p>
                  <p className="text-sm mb-4">
                    {session?.status === "ended"
                      ? "The transcript for this session may not be accessible due to database permissions."
                      : "Transcript will appear here as the session progresses."}
                  </p>
                  {session?.status === "ended" && (
                    <div
                      className={`text-xs p-3 rounded-lg ${
                        darkMode
                          ? "bg-gray-700 text-gray-300"
                          : "bg-gray-50 text-gray-600"
                      }`}
                    >
                      <p className="font-medium mb-1">🔍 Troubleshooting:</p>
                      <p>
                        • Check if you have permission to view this
                        session&apos;s transcript
                      </p>
                      <p>
                        • Database access policies may prevent viewing
                        transcripts from ended sessions
                      </p>
                      <p>
                        • Contact the session host if you believe you should
                        have access
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chatbot for past session */}
          <Chatbot
            transcript={transcript.map((line) => line.original_text).join("\n")}
            sessionId={sessionId}
          />

          {/* Footer */}
          <div
            className={`text-center py-8 ${
              darkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            <p className="text-sm">{t("publicAccess")}</p>
            <p className="text-xs mt-2">{t("poweredBy")}</p>
          </div>
        </div>
      </div>

      {/* 🆕 세션 저장 모달 (호스트가 아닌 경우만) */}
      {(!user || session?.host_id !== user?.id) && (
        <SaveSessionModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          sessionId={sessionId}
          sessionTitle={session?.title || ""}
          onSaved={() => {
            setSessionSaved(true);
            setShowSaveModal(false);
          }}
        />
      )}
    </div>
  );
}
