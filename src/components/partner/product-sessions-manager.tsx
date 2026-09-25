'use client';

import { useEffect, useState } from 'react';
import {
  createProductSession,
  deleteProductSession,
  listProductSessions,
  updateProductSession,
  ManagedSession,
} from '@/actions/partner/sessions';

type SessionFormValue = { session_date: string; start_time: string; end_time: string; capacity: string };

const EMPTY_FORM: SessionFormValue = { session_date: '', start_time: '09:00', end_time: '', capacity: '' };

function formatTime(time: string): string {
  return time.slice(0, 5);
}

function SessionForm({
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  initial?: SessionFormValue;
  onSubmit: (value: SessionFormValue) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [value, setValue] = useState<SessionFormValue>(initial ?? EMPTY_FORM);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(value);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-white p-2.5 text-xs">
      <div className="flex gap-1.5">
        <input
          type="date"
          value={value.session_date}
          onChange={(e) => setValue({ ...value, session_date: e.target.value })}
          required
          className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5"
        />
        <input
          type="time"
          value={value.start_time}
          onChange={(e) => setValue({ ...value, start_time: e.target.value })}
          required
          className="w-24 rounded-lg border border-gray-300 px-2 py-1.5"
        />
        <input
          type="time"
          value={value.end_time}
          onChange={(e) => setValue({ ...value, end_time: e.target.value })}
          aria-label="종료 시간(선택)"
          className="w-24 rounded-lg border border-gray-300 px-2 py-1.5"
        />
      </div>
      <input
        type="number"
        min={1}
        value={value.capacity}
        onChange={(e) => setValue({ ...value, capacity: e.target.value })}
        placeholder="정원(명)"
        required
        className="rounded-lg border border-gray-300 px-2 py-1.5"
      />
      <div className="flex gap-1.5">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-gray-300 py-1.5 text-gray-600">
          취소
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 rounded-lg bg-blue-600 py-1.5 font-semibold text-white disabled:opacity-50"
        >
          {isSubmitting ? '저장 중...' : '저장'}
        </button>
      </div>
    </form>
  );
}

// [상품 회차 관리](2026-09-25 사용자 지시): "상품에 대하여 시간도 세팅가능하게
// 하는건?" → "이 방식으로 구현들어가고" — time_mode='session' 상품을 펼치면
// 나오는 회차(날짜/시작~종료 시간/정원) CRUD 패널. products-manager.tsx의
// ProductForm/ProductsManager와 동일한 인라인 폼 관례를 따른다.
export function ProductSessionsManager({ productId }: { productId: string }) {
  const [sessions, setSessions] = useState<ManagedSession[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function reload() {
    const result = await listProductSessions(productId);
    if ('error' in result) {
      setErrorMessage(result.error);
      return;
    }
    setErrorMessage(null);
    setSessions(result.sessions);
  }

  useEffect(() => {
    reload();
    // productId는 이 컴포넌트가 마운트되는 동안 바뀌지 않는다(상품별로 별도 인스턴스).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function handleCreate(value: SessionFormValue) {
    setIsSubmitting(true);
    const result = await createProductSession({
      product_id: productId,
      session_date: value.session_date,
      start_time: value.start_time,
      end_time: value.end_time || null,
      capacity: Number(value.capacity),
    });
    setIsSubmitting(false);
    if ('error' in result) {
      setErrorMessage(result.error);
      return;
    }
    setIsAdding(false);
    await reload();
  }

  async function handleUpdate(id: string, value: SessionFormValue) {
    setIsSubmitting(true);
    const result = await updateProductSession(id, {
      product_id: productId,
      session_date: value.session_date,
      start_time: value.start_time,
      end_time: value.end_time || null,
      capacity: Number(value.capacity),
    });
    setIsSubmitting(false);
    if ('error' in result) {
      setErrorMessage(result.error);
      return;
    }
    setEditingId(null);
    await reload();
  }

  async function handleDelete(id: string) {
    if (!window.confirm('이 회차를 삭제할까요?')) return;
    const result = await deleteProductSession(id);
    if ('error' in result) {
      setErrorMessage(result.error);
      return;
    }
    await reload();
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
      <p className="text-xs font-semibold text-blue-700">회차 관리</p>
      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

      {sessions === null ? (
        <p className="text-xs text-gray-400">불러오는 중...</p>
      ) : sessions.length === 0 && !isAdding ? (
        <p className="text-xs text-gray-400">등록된 회차가 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sessions.map((session) =>
            editingId === session.id ? (
              <li key={session.id}>
                <SessionForm
                  initial={{
                    session_date: session.session_date,
                    start_time: formatTime(session.start_time),
                    end_time: session.end_time ? formatTime(session.end_time) : '',
                    capacity: String(session.capacity),
                  }}
                  onSubmit={(value) => handleUpdate(session.id, value)}
                  onCancel={() => setEditingId(null)}
                  isSubmitting={isSubmitting}
                />
              </li>
            ) : (
              <li
                key={session.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs"
              >
                <span className="font-medium text-gray-800">
                  {session.session_date} {formatTime(session.start_time)}
                  {session.end_time ? `~${formatTime(session.end_time)}` : ''}
                </span>
                <span className="text-gray-500">
                  {session.booked}/{session.capacity}명
                </span>
                <div className="flex shrink-0 gap-1.5">
                  <button type="button" onClick={() => setEditingId(session.id)} className="text-gray-500 hover:text-gray-700">
                    수정
                  </button>
                  <button type="button" onClick={() => handleDelete(session.id)} className="text-red-500 hover:text-red-600">
                    삭제
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {isAdding ? (
        <SessionForm onSubmit={handleCreate} onCancel={() => setIsAdding(false)} isSubmitting={isSubmitting} />
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="rounded-lg border border-dashed border-blue-300 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
        >
          + 회차 추가
        </button>
      )}
    </div>
  );
}
