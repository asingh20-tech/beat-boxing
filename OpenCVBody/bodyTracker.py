import cv2
import time
import numpy as np
import math
from collections import deque
import pyautogui

try:
    import mediapipe as mp
except Exception as _e:
    mp = None
    _mp_import_error = _e


class BodyTracker:
    """
    Full-body tracker using MediaPipe Pose with a simple camera visualizer.
    Call draw_body(frame) each frame, then get_landmark_positions(...) to read pose landmarks.
    """

    def __init__(
        self,
        detect_static=False,
        model_complexity=1,
        smooth_landmarks=True,
        enable_segmentation=False,
        detection_confidence=0.5,
        tracking_confidence=0.5,
        use_holistic=False,
    ):
        if mp is None:
            raise ImportError(
                "mediapipe is not available (possibly due to unsupported Python version). Install mediapipe for your interpreter or use Python 3.10–3.12."
            ) from _mp_import_error

        self.detect_static = detect_static
        self.model_complexity = model_complexity
        self.smooth_landmarks = smooth_landmarks
        self.enable_segmentation = enable_segmentation
        self.detection_confidence = detection_confidence
        self.tracking_confidence = tracking_confidence
        self.use_holistic = use_holistic

        self.drawer = mp.solutions.drawing_utils
        self.styles = mp.solutions.drawing_styles
        self.mp_pose = mp.solutions.pose
        self.mp_hands = mp.solutions.hands
        self.mp_face = mp.solutions.face_mesh
        self.mp_holistic = mp.solutions.holistic

        if self.use_holistic:
            self.model = self.mp_holistic.Holistic(
                static_image_mode=self.detect_static,
                model_complexity=self.model_complexity,
                smooth_landmarks=self.smooth_landmarks,
                enable_segmentation=self.enable_segmentation,
                min_detection_confidence=self.detection_confidence,
                min_tracking_confidence=self.tracking_confidence,
            )
        else:
            self.model = self.mp_pose.Pose(
                static_image_mode=self.detect_static,
                model_complexity=self.model_complexity,
                smooth_landmarks=self.smooth_landmarks,
                enable_segmentation=self.enable_segmentation,
                min_detection_confidence=self.detection_confidence,
                min_tracking_confidence=self.tracking_confidence,
            )
        self.results = None

    def draw_body(self, frame, draw_landmarks=True, draw_connections=True, overlay_segmentation=True):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        self.results = self.model.process(rgb)

        # Optional segmentation overlay
        if (
            self.enable_segmentation
            and overlay_segmentation
            and self.results
            and getattr(self.results, "segmentation_mask", None) is not None
        ):
            mask = self.results.segmentation_mask
            condition = np.stack((mask,) * 3, axis=-1) > 0.5
            bg = np.zeros_like(frame)
            frame[:] = np.where(condition, frame, bg)

        if self.results and self.results.pose_landmarks and draw_landmarks:
            self.drawer.draw_landmarks(
                frame,
                self.results.pose_landmarks,
                self.mp_pose.POSE_CONNECTIONS if draw_connections else None,
                landmark_drawing_spec=self.styles.get_default_pose_landmarks_style(),
            )
        return frame

    def get_landmark_positions(
        self,
        frame,
        draw_points=False,
        point_color=(0, 255, 255),
        include_z=False,
        include_visibility=False,
        return_as_dict=False,
        sources=("pose",),  # ('pose', 'left_hand', 'right_hand', 'face')
    ):
        """
        Returns list of [idx, x, y(, z)(, visibility)] or dict keyed by component names.
        When use_holistic=True, set sources=('pose','left_hand','right_hand','face') for all points.
        Coordinates are in image pixels.
        """
        out = []
        if not getattr(self, 'results', None):
            return {} if return_as_dict else []

        height, width, _ = frame.shape

        def add_points(landmarks, comp, vis_attr=False):
            if not landmarks:
                return
            for idx, lm in enumerate(landmarks.landmark):
                x = int(lm.x * width)
                y = int(lm.y * height)
                entry = [idx, x, y]
                if include_z:
                    entry.append(round(float(lm.z), 4))
                if include_visibility and vis_attr:
                    entry.append(round(float(getattr(lm, 'visibility', 0.0)), 4))
                out.append((comp, entry))
                if draw_points:
                    cv2.circle(frame, (x, y), 3, point_color, cv2.FILLED)

        # Pose landmarks
        if "pose" in sources and getattr(self.results, "pose_landmarks", None):
            add_points(self.results.pose_landmarks, "POSE", vis_attr=True)
        # Hand landmarks (holistic only)
        if self.use_holistic:
            if "left_hand" in sources and getattr(self.results, "left_hand_landmarks", None):
                add_points(self.results.left_hand_landmarks, "LEFT_HAND")
            if "right_hand" in sources and getattr(self.results, "right_hand_landmarks", None):
                add_points(self.results.right_hand_landmarks, "RIGHT_HAND")
            # Face landmarks
            if "face" in sources and getattr(self.results, "face_landmarks", None):
                add_points(self.results.face_landmarks, "FACE")

        if return_as_dict:
            name_map = {}
            for comp, entry in out:
                idx = entry[0]
                if comp == "POSE":
                    # Map to enum name when possible
                    try:
                        key = f"POSE:{self.mp_pose.PoseLandmark(idx).name}"
                    except Exception:
                        key = f"POSE:{idx}"
                else:
                    key = f"{comp}:{idx}"
                name_map[key] = entry
            return name_map
        else:
            return [entry for _comp, entry in out]

    def get_bounding_box(self, frame, margin=10, sources=("pose",)):
        """Compute a bounding box around detected pose landmarks; returns (x, y, w, h) or None."""
        pts = self.get_landmark_positions(frame, draw_points=False, sources=sources)
        if not pts:
            return None
        xs = [p[1] for p in pts]
        ys = [p[2] for p in pts]
        x1, y1 = max(min(xs) - margin, 0), max(min(ys) - margin, 0)
        x2, y2 = min(max(xs) + margin, frame.shape[1] - 1), min(max(ys) + margin, frame.shape[0] - 1)
        return x1, y1, x2 - x1, y2 - y1


class PunchDetector:
    """Simple punch classifier: Block (wrists together), Hook (out then in arc), Uppercut (upwards).
    Uses wrist motion vs. shoulder with velocity/geometry heuristics and cooldown.
    """
    def __init__(self, history_len=12, cooldown=0.8):
        from collections import deque
        self.history = {
            'RIGHT': deque(maxlen=history_len),
            'LEFT': deque(maxlen=history_len),
        }  # item: (t, (wx, wy, wz?), (sx, sy, sz?))
        self.last_trigger_time = {'RIGHT': 0.0, 'LEFT': 0.0}
        self.cooldown = cooldown

    def _avg_velocity(self, traj):
        if len(traj) < 3:
            return 0.0, 0.0, 0.0
        vx_sum = vy_sum = dt_sum = 0.0
        # average over last few segments
        for i in range(-1, -min(len(traj), 4), -1):
            t2, (x2, y2, *_), _ = traj[i]
            t1, (x1, y1, *_), _ = traj[i - 1]
            dt = max(t2 - t1, 1e-4)
            vx_sum += (x2 - x1) / dt
            vy_sum += (y2 - y1) / dt
            dt_sum += dt
        n = max(min(len(traj) - 1, 3), 1)
        return vx_sum / n, vy_sum / n, dt_sum

    def _radial_change(self, traj):
        if len(traj) < 3:
            return 0.0, 0.0
        t_now, (wx, wy, *_), (sx, sy, *_) = traj[-1]
        t_prev, (wx0, wy0, *_), (sx0, sy0, *_) = traj[-3]
        r_now = math.hypot(wx - sx, wy - sy)
        r_prev = math.hypot(wx0 - sx0, wy0 - sy0)
        return r_now - r_prev, max(t_now - t_prev, 1e-4)

    def _radial_series(self, traj, k=5, gap=2):
        rs = []
        for i in range(-1, -(k * gap + 1), -gap):
            if len(traj) + i <= 0:
                break
            _, (wx, wy, *_), (sx, sy, *_) = traj[i]
            rs.append(math.hypot(wx - sx, wy - sy))
        return list(reversed(rs))  # oldest -> newest

    def _angular_change(self, traj):
        if len(traj) < 3:
            return 0.0
        _, (wx, wy, *_), (sx, sy, *_) = traj[-1]
        _, (wx0, wy0, *_), (sx0, sy0, *_) = traj[-3]
        v_now = (wx - sx, wy - sy)
        v_prev = (wx0 - sx0, wy0 - sy0)
        a1 = math.atan2(v_now[1], v_now[0])
        a0 = math.atan2(v_prev[1], v_prev[0])
        d = math.degrees((a1 - a0 + math.pi) % (2 * math.pi) - math.pi)
        return abs(d)

    def _depth_delta(self, traj):
        # returns (delta wrist depth, delta relative-to-shoulder depth) over a short window
        if len(traj) < 4:
            return None, None
        _, (_, _, wz_now), (_, _, sz_now) = traj[-1]
        _, (_, _, wz_prev), (_, _, sz_prev) = traj[-4]
        if wz_now is None or wz_prev is None:
            return None, None
        dw = wz_now - wz_prev
        drel = (wz_now - sz_now) - (wz_prev - sz_prev if sz_prev is not None else 0.0)
        return dw, drel

    def update(self, landmarks_dict, now, frame_shape):
        h, w = frame_shape[0], frame_shape[1]
        diag = (w**2 + h**2) ** 0.5
        speed_fast = diag * 2.2  # px/s
        speed_med = diag * 1.5
        speed_vert = diag * 1.4
        radial_thresh = max(w, h) * 0.10
        radial_back = max(w, h) * 0.07
        z_thresh = 0.07  # MediaPipe z (normalized, more negative = closer)
        up_dist = max(h * 0.12, 60)
        # elbow_y_thresh = h * 0.10  # Allowable elbow-shoulder y-difference for hook
        elbow_y_thresh = h * 0.18  # Relaxed: Allow greater elbow-shoulder y-difference for hook

        elbow_wrist_thresh = diag * 0.08  # Threshold for elbow-wrist proximity during jab

        # --- Block detection: wrists close together AND close to face (nose) ---
        wr_r = landmarks_dict.get("POSE:RIGHT_WRIST")
        wr_l = landmarks_dict.get("POSE:LEFT_WRIST")
        nose = landmarks_dict.get("POSE:NOSE")
        if wr_r and wr_l and nose:
            wx_r, wy_r = wr_r[1], wr_r[2]
            wx_l, wy_l = wr_l[1], wr_l[2]
            nx, ny = nose[1], nose[2]
            wrist_dist = math.hypot(wx_r - wx_l, wy_r - wy_l)
            block_thresh = diag * 0.10  # Tune as needed

            # Both wrists must be close to the nose
            wr_r_face_dist = math.hypot(wx_r - nx, wy_r - ny)
            wr_l_face_dist = math.hypot(wx_l - nx, wy_l - ny)
            face_thresh = diag * 0.13  # Tune as needed

            if (
                wrist_dist < block_thresh and
                wr_r_face_dist < face_thresh and
                wr_l_face_dist < face_thresh and
                (now - min(self.last_trigger_time['RIGHT'], self.last_trigger_time['LEFT']) > self.cooldown)
            ):
                self.last_trigger_time['RIGHT'] = now
                self.last_trigger_time['LEFT'] = now
                return "Block"

        for side, pose_prefix in (("RIGHT", "POSE:RIGHT_"), ("LEFT", "POSE:LEFT_")):
            wr = landmarks_dict.get(pose_prefix + "WRIST")
            sh = landmarks_dict.get(pose_prefix + "SHOULDER")
            el = landmarks_dict.get(pose_prefix + "ELBOW")  # <--- Add elbow
            if not (wr and sh):
                continue
            wx, wy = wr[1], wr[2]
            wz = wr[3] if len(wr) > 3 else None
            sx, sy = sh[1], sh[2]
            sz = sh[3] if len(sh) > 3 else None
            ex, ey = (el[1], el[2]) if el else (None, None)  # <--- Elbow x, y

            self.history[side].append((now, (wx, wy, wz), (sx, sy, sz), (ex, ey)))

            traj = self.history[side]
            if len(traj) < 5:
                continue

            if now - self.last_trigger_time[side] < self.cooldown:
                continue

            # Only pass the first three elements (ignore elbow) to helper functions
            traj_no_elbow = [t[:3] for t in traj]

            vx, vy, _ = self._avg_velocity(traj_no_elbow)
            speed = math.hypot(vx, vy)
            dr, _ = self._radial_change(traj_no_elbow)
            dtheta = self._angular_change(traj_no_elbow)

            # Unit radial dir
            rx, ry = (traj[-1][1][0] - traj[-1][2][0], traj[-1][1][1] - traj[-1][2][1])
            rmag = math.hypot(rx, ry) or 1.0
            rux, ruy = rx / rmag, ry / rmag
            align = (vx * rux + vy * ruy) / (speed + 1e-6)

            # 2) Hook: arm goes out (radial increase) then back in, with noticeable angular sweep
            rs = self._radial_series(traj_no_elbow, k=5, gap=2)
            if len(rs) >= 5:
                out_then_in = (rs[-3] - rs[-5] > radial_thresh) and (rs[-1] - rs[-3] < -radial_back)
                horiz_frac = abs(vx) / max(speed, 1e-6)
                # --- Elbow y relative to shoulder y ---
                # Use most recent elbow and shoulder
                _, _, _, (ex, ey) = traj[-1]
                _, _, _, (ex0, ey0) = traj[-3]
                _, (_, _, _), (_, sy, _), _ = traj[-1]
                if ex is not None and ey is not None:
                    elbow_shoulder_y_diff = abs(ey - sy)
                else:
                    elbow_shoulder_y_diff = None

                # --- New: Hook if wrist x passes face (nose) x ---
                nose = landmarks_dict.get("POSE:NOSE")
                hook_by_x = False
                if nose:
                    nx = nose[1]
                    # For right: wrist x > nose x, for left: wrist x < nose x
                    if side == "RIGHT" and wx > nx:
                        hook_by_x = True
                    elif side == "LEFT" and wx < nx:
                        hook_by_x = True

                if (
                    speed > speed_med
                    and out_then_in
                    and dtheta > 25.0
                    and horiz_frac > 0.5
                    and (elbow_shoulder_y_diff is not None and elbow_shoulder_y_diff < elbow_y_thresh)
                ) or hook_by_x:
                    self.last_trigger_time[side] = now
                    return f"Hook ({'R' if side=='RIGHT' else 'L'})"
                
            # 3) Uppercut: strong vertical upward motion
            dy_total = traj[-1][1][1] - traj[-4][1][1]  # negative if up
            vert_frac = abs(vy) / max(speed, 1e-6)
            if speed > speed_vert and vy < 0 and vert_frac > 0.7 and (-dy_total) > up_dist:
                self.last_trigger_time[side] = now
                return f"Uppercut ({'R' if side=='RIGHT' else 'L'})"
            
        return None


def punch_label_to_key(label):
    """
    Map punch detector label to the actual key string as per your mapping.
    Returns the key string or None.
    """
    if not label:
        return None
    label = label.lower()
    if label == "block":
        return 'f'  # LEFT_BLOCK
    if label.startswith("hook"):
        if "r" in label:
            return 'l'  # RIGHT_HOOK
        else:
            return 's'  # LEFT_HOOK
    if label.startswith("uppercut"):
        if "r" in label:
            return 'k'  # RIGHT_UPPERCUT
        else:
            return 'd'  # LEFT_UPPERCUT
    return None

def _demo():
    cap = cv2.VideoCapture(0)
    cap.set(3, 640)
    cap.set(4, 480)

    tracker = BodyTracker(
        detect_static=False,
        model_complexity=1,
        smooth_landmarks=True,
        enable_segmentation=True,
        detection_confidence=0.6,
        tracking_confidence=0.6,
        use_holistic=True,
    )

    punch = PunchDetector()
    show_label = ''
    show_until = 0.0

    prev_time = 0.0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = tracker.draw_body(frame)

        bbox = tracker.get_bounding_box(frame, sources=("pose", "left_hand", "right_hand", "face"))
        if bbox:
            x, y, w, h = bbox
            cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 200, 255), 2)

        pose_landmarks = tracker.get_landmark_positions(
            frame,
            draw_points=False,
            include_z=True,
            return_as_dict=True,
            sources=("pose",),
        )
        if pose_landmarks:
            label = punch.update(pose_landmarks, time.time(), frame.shape)
            if label:
                show_label = label
                show_until = time.time() + 1.2
                key = punch_label_to_key(label)
                if key:
                    pyautogui.press(key)

        # FPS and overlays
        curr_time = time.time()
        fps = 1.0 / max(curr_time - prev_time, 1e-4)
        prev_time = curr_time
        cv2.putText(frame, f"FPS: {int(fps)}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

        if show_label and curr_time <= show_until:
            cv2.putText(frame, show_label, (10, 70), cv2.FONT_HERSHEY_DUPLEX, 1.2, (0, 215, 255), 3)

        cv2.imshow('Body Tracker', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    _demo()