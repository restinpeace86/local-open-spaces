import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingForm } from './onboarding-form';

const submitPartnerOnboardingMock = vi.fn();
vi.mock('@/actions/partner/onboarding', () => ({
  submitPartnerOnboarding: (input: unknown) => submitPartnerOnboardingMock(input),
}));

// [나드리픽 파트너 PMS — 온보딩 페이지](2026-09-20 사용자 지시): SpotPicker 자체는
// 이미 별도로 검증된 컴포넌트(community/spot-picker.test.tsx 등)라, 여기서는 이
// 폼이 선택 콜백을 받아 주소를 자동으로 채우는지만 확인하면 된다 — 실제 검색/자동
// 등록 로직까지 재현할 필요 없이 최소한의 스텁으로 대체한다.
vi.mock('@/components/community/spot-picker', () => ({
  SpotPicker: ({ onSelect }: { onSelect: (spot: { id: string; name: string; address: string | null }) => void }) => (
    <button type="button" onClick={() => onSelect({ id: 'spot-1', name: '나드리 딸기농장', address: '경기도 양평군' })}>
      스팟 선택 스텁
    </button>
  ),
}));

describe('OnboardingForm', () => {
  afterEach(() => {
    submitPartnerOnboardingMock.mockReset();
    vi.unstubAllGlobals();
  });

  function fillRequiredTextFields() {
    fireEvent.change(screen.getByPlaceholderText('예: 나드리 딸기농장'), { target: { value: '나드리 딸기농장' } });
    fireEvent.change(screen.getByPlaceholderText('예: 김나드'), { target: { value: '김나드' } });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '010-1234-5678' } });
  }

  it('스팟을 선택하면 그 스팟의 주소로 주소 입력창이 자동으로 채워진다', () => {
    render(<OnboardingForm />);
    fireEvent.click(screen.getByText('스팟 선택 스텁'));
    expect(screen.getByPlaceholderText('스팟을 연동하면 자동으로 채워져요')).toHaveValue('경기도 양평군');
  });

  it('이미 주소를 직접 입력해 뒀으면 스팟 선택으로 덮어쓰지 않는다', () => {
    render(<OnboardingForm />);
    fireEvent.change(screen.getByPlaceholderText('스팟을 연동하면 자동으로 채워져요'), {
      target: { value: '내가 직접 쓴 주소' },
    });
    fireEvent.click(screen.getByText('스팟 선택 스텁'));
    expect(screen.getByPlaceholderText('스팟을 연동하면 자동으로 채워져요')).toHaveValue('내가 직접 쓴 주소');
  });

  it('필수 항목을 모두 채우고 제출하면 submitPartnerOnboarding을 올바른 값으로 호출한다', async () => {
    submitPartnerOnboardingMock.mockResolvedValue({ success: true });
    render(<OnboardingForm />);

    fillRequiredTextFields();
    fireEvent.click(screen.getByText('스팟 선택 스텁'));
    fireEvent.click(screen.getByText('등록 완료'));

    await waitFor(() =>
      expect(submitPartnerOnboardingMock).toHaveBeenCalledWith({
        farm_name: '나드리 딸기농장',
        owner_name: '김나드',
        phone: '010-1234-5678',
        image_url: null,
        address: '경기도 양평군',
        spot_id: 'spot-1',
      })
    );
  });

  it('제출 결과에 error가 있으면 화면에 보여준다', async () => {
    submitPartnerOnboardingMock.mockResolvedValue({ error: '농장 이름을 입력해 주세요.' });
    render(<OnboardingForm />);

    fillRequiredTextFields();
    fireEvent.click(screen.getByText('스팟 선택 스텁'));
    fireEvent.click(screen.getByText('등록 완료'));

    expect(await screen.findByText('농장 이름을 입력해 주세요.')).toBeInTheDocument();
  });

  it('이미지를 선택하면 업로드 API를 호출하고, 성공하면 그 URL을 제출값에 포함한다', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ url: 'https://example.com/farm.jpg' }) } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:preview') });
    submitPartnerOnboardingMock.mockResolvedValue({ success: true });

    render(<OnboardingForm />);
    const file = new File(['x'], 'farm.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/partner/upload-farm-image', expect.any(Object)));

    fillRequiredTextFields();
    fireEvent.click(screen.getByText('스팟 선택 스텁'));
    fireEvent.click(screen.getByText('등록 완료'));

    await waitFor(() =>
      expect(submitPartnerOnboardingMock).toHaveBeenCalledWith(
        expect.objectContaining({ image_url: 'https://example.com/farm.jpg' })
      )
    );
  });
});
