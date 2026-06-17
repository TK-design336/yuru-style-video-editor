import { useCallback, useEffect, useState } from "react";
import {
  loadTranscriptionSettings,
  saveTranscriptionSettings,
  type ExpectedSpeakers,
  type TranscriptionSettings,
} from "@/lib/ingest/transcriptionSettings";

interface TranscriptionOptionsPanelProps {
  disabled?: boolean;
}

export function TranscriptionOptionsPanel({
  disabled = false,
}: TranscriptionOptionsPanelProps) {
  const [settings, setSettings] = useState<TranscriptionSettings>(() =>
    loadTranscriptionSettings(),
  );

  useEffect(() => {
    saveTranscriptionSettings(settings);
  }, [settings]);

  const patch = useCallback((partial: Partial<TranscriptionSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  return (
    <section className="glass-panel mb-3 border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm">
      <h3 className="font-medium text-amber-100">文字起こしの精度設定</h3>
      <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
        Whisper（large-v3）で書き起こし、NVIDIA NeMo（MSDD）で話者分離します。
        Hugging Face トークンは不要です。初回は NeMo モデルのダウンロードに時間がかかります。
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-white/70">
          参加人数（話者分離）
          <select
            disabled={disabled}
            value={String(settings.expectedSpeakers)}
            onChange={(e) => {
              const v = e.target.value;
              patch({
                expectedSpeakers:
                  v === "auto" ? "auto" : (Number(v) as ExpectedSpeakers),
              });
            }}
            className="glass-input mt-1 px-2 py-1.5"
          >
            <option value="auto">自動（最大10人まで推定）</option>
            <option value="2">2人（対談・掛け合い向け）</option>
            <option value="3">3人</option>
            <option value="4">4人</option>
          </select>
        </label>

        <label className="block text-xs text-white/70">
          Whisper モデル
          <select
            disabled={disabled}
            value={settings.whisperModel}
            onChange={(e) =>
              patch({
                whisperModel:
                  e.target.value === "large-v2" ? "large-v2" : "large-v3",
              })
            }
            className="glass-input mt-1 px-2 py-1.5"
          >
            <option value="large-v3">large-v3（推奨・日本語向け）</option>
            <option value="large-v2">large-v2</option>
          </select>
        </label>

        <label className="block text-xs text-white/70 sm:col-span-2">
          NeMo 話者分離
          <select
            disabled={disabled}
            value={settings.diarizer}
            onChange={(e) =>
              patch({
                diarizer: e.target.value === "sortformer" ? "sortformer" : "msdd",
              })
            }
            className="glass-input mt-1 px-2 py-1.5"
          >
            <option value="msdd">MSDD（推奨・電話・対談向け）</option>
            <option value="sortformer">Sortformer（実験的）</option>
          </select>
        </label>
      </div>

      <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-white/70">
        <input
          type="checkbox"
          disabled={disabled}
          checked={settings.stemming}
          onChange={(e) => patch({ stemming: e.target.checked })}
          className="mt-0.5 rounded border-white/20"
        />
        <span>
          <span className="font-medium text-white/85">BGM 除去（Demucs）</span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-white/45">
            BGM・SE が強い動画向け。トーク系・無伴奏は OFF のままが精度向上しやすいです。
          </span>
        </span>
      </label>

      <details className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-amber-100/90">
          話者分離の詳細（A/B テスト）
        </summary>
        <p className="mt-2 text-[11px] leading-relaxed text-white/45">
          1本の動画で設定を1つずつ変えて再実行し、効果を比較してください。完了メッセージに適用設定が表示されます。
        </p>

        <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            disabled={disabled}
            checked={settings.realignSpeakersAtSentenceEnd}
            onChange={(e) =>
              patch({ realignSpeakersAtSentenceEnd: e.target.checked })
            }
            className="mt-0.5 rounded border-white/20"
          />
          <span>
            <span className="font-medium text-white/85">文末話者補正（realign）</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-white/45">
              OFF にすると NeMo の単語ラベルをそのまま使います。話者交代直後の誤帰属検証用。
            </span>
          </span>
        </label>

        {settings.diarizer === "msdd" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-white/70">
              VAD 感度（MSDD 内蔵）
              <select
                disabled={disabled}
                value={settings.vadPreset}
                onChange={(e) =>
                  patch({
                    vadPreset:
                      e.target.value === "sensitive" ? "sensitive" : "relaxed",
                  })
                }
                className="glass-input mt-1 px-2 py-1.5"
              >
                <option value="relaxed">relaxed（現行・厳しめ）</option>
                <option value="sensitive">sensitive（短発話・相槌向け）</option>
              </select>
            </label>

            <label className="block text-xs text-white/70">
              sigmoid threshold
              <select
                disabled={disabled}
                value={String(settings.msddSigmoidThreshold)}
                onChange={(e) =>
                  patch({
                    msddSigmoidThreshold:
                      e.target.value === "0.5" ? 0.5 : 0.7,
                  })
                }
                className="glass-input mt-1 px-2 py-1.5"
              >
                <option value="0.7">0.7（既定）</option>
                <option value="0.5">0.5（感度↑）</option>
              </select>
            </label>

            <label className="block text-xs text-white/70 sm:col-span-2">
              diar window length（秒）
              <select
                disabled={disabled}
                value={String(settings.msddDiarWindowLength)}
                onChange={(e) =>
                  patch({
                    msddDiarWindowLength:
                      e.target.value === "30" ? 30 : 50,
                  })
                }
                className="glass-input mt-1 px-2 py-1.5"
              >
                <option value="50">50（既定）</option>
                <option value="30">30（局所変化向け）</option>
              </select>
            </label>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-white/40">
            VAD / sigmoid / window は MSDD 選択時のみ有効です。
          </p>
        )}

        <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            disabled={disabled}
            checked={settings.diarizationDebugDump}
            onChange={(e) =>
              patch({ diarizationDebugDump: e.target.checked })
            }
            className="mt-0.5 rounded border-white/20"
          />
          <span>
            <span className="font-medium text-white/85">
              話者分離デバッグ JSON を出力
            </span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-white/45">
              動画と同じフォルダに{" "}
              <code className="text-white/55">*.diarization_debug.json</code>{" "}
              を保存。NeMo 区間・マッピング直後・最終ラベルを比較できます。
            </span>
          </span>
        </label>
      </details>

      <label className="mt-3 block text-xs text-white/70">
        固有名詞ヒント（カンマ・改行区切り・任意）
        <textarea
          disabled={disabled}
          value={settings.vocabularyHints}
          onChange={(e) => patch({ vocabularyHints: e.target.value })}
          placeholder="例: みずほ銀行, 番組名, ゲストの本名"
          rows={2}
          className="glass-input mt-1 resize-y px-2 py-1.5"
        />
      </label>
      <p className="mt-1 text-[11px] text-white/40">
        設定変更後は文字起こしの再実行が必要です。
      </p>
    </section>
  );
}
