import json
import os
import tempfile
import wave

from typing import Union

import torch

from nemo.collections.asr.models.msdd_models import NeuralDiarizer
from nemo.collections.asr.parts.utils.speaker_utils import rttm_to_labels
from omegaconf import OmegaConf


class MSDDDiarizer:
    def __init__(
        self,
        device: Union[str, torch.device],
        *,
        vad_preset: str = "relaxed",
        sigmoid_threshold: float = 0.7,
        diar_window_length: int = 50,
    ):
        self.model: NeuralDiarizer = NeuralDiarizer(
            cfg=create_config(
                vad_preset=vad_preset,
                sigmoid_threshold=sigmoid_threshold,
                diar_window_length=diar_window_length,
            )
        ).to(device)

    def diarize(
        self,
        audio: torch.Tensor,
        *,
        num_speakers: int | None = None,
        max_speakers: int = 8,
    ):
        with tempfile.TemporaryDirectory() as temp_path:
            pcm = (audio.cpu().numpy() * 32768).clip(-32768, 32767).astype("int16")
            with wave.open(os.path.join(temp_path, "mono_file.wav"), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                wf.writeframes(pcm.tobytes())

            manifest_path = os.path.join(temp_path, "manifest.json")
            meta = {
                "audio_filepath": os.path.join(temp_path, "mono_file.wav"),
                "offset": 0,
                "duration": None,
                "label": "infer",
                "text": "-",
                "rttm_filepath": None,
                "uem_filepath": None,
            }

            with open(manifest_path, "w") as f:
                json.dump(meta, f)

            self.model._initialize_configs(
                manifest_path=manifest_path,
                max_speakers=max_speakers,
                num_speakers=num_speakers,
                tmpdir=temp_path,
                batch_size=24,
                num_workers=0,
                verbose=True,
            )
            self.model.clustering_embedding.clus_diar_model._diarizer_params.out_dir = temp_path
            self.model.clustering_embedding.clus_diar_model._diarizer_params.manifest_filepath = (
                manifest_path
            )
            self.model.msdd_model.cfg.test_ds.manifest_filepath = manifest_path
            self.model.diarize()

            pred_labels_clus = rttm_to_labels(
                os.path.join(temp_path, "pred_rttms", "mono_file.rttm")
            )

            labels = []
            for label in pred_labels_clus:
                start, end, speaker = label.split()
                start, end = float(start), float(end)
                start, end = int(start * 1000), int(end * 1000)
                labels.append((start, end, int(speaker.split("_")[1])))

            labels = sorted(labels, key=lambda x: x[0])

        return labels


def create_config(
    *,
    vad_preset: str = "relaxed",
    sigmoid_threshold: float = 0.7,
    diar_window_length: int = 50,
):
    config = OmegaConf.load(os.path.join(os.path.dirname(__file__), "diar_infer_telephonic.yaml"))
    pretrained_vad = "vad_multilingual_marblenet"
    pretrained_speaker_model = "titanet_large"

    config.diarizer.out_dir = None
    config.diarizer.manifest_filepath = None
    config.diarizer.speaker_embeddings.model_path = pretrained_speaker_model
    config.diarizer.oracle_vad = False  # compute VAD provided with model_path to vad config
    config.diarizer.clustering.parameters.oracle_num_speakers = False

    config.diarizer.vad.model_path = pretrained_vad
    if vad_preset == "sensitive":
        # diar_infer_telephonic.yaml の CH109 チューニング値（短い相槌・割り込み向け）
        config.diarizer.vad.parameters.onset = 0.1
        config.diarizer.vad.parameters.offset = 0.1
        config.diarizer.vad.parameters.pad_offset = 0.0
    else:
        # 話者区間の取りこぼしを減らす（既定より検出を緩める）
        config.diarizer.vad.parameters.onset = 0.5
        config.diarizer.vad.parameters.offset = 0.35
        config.diarizer.vad.parameters.pad_offset = 0.05

    config.diarizer.msdd_model.model_path = "diar_msdd_telephonic"
    config.diarizer.msdd_model.parameters.sigmoid_threshold = [float(sigmoid_threshold)]
    config.diarizer.msdd_model.parameters.diar_window_length = int(diar_window_length)

    return config
