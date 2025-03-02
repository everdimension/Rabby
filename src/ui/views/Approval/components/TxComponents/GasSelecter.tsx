import clsx from 'clsx';
import React, { useEffect, useState, useRef } from 'react';
import { Input, Button, Skeleton, Form, Slider, Tooltip } from 'antd';
import BigNumber from 'bignumber.js';
import { ValidateStatus } from 'antd/lib/form/FormItem';
import { useTranslation, Trans } from 'react-i18next';
import { useDebounce } from 'react-use';
import { CHAINS, GAS_LEVEL_TEXT, MINIMUM_GAS_LIMIT } from 'consts';
import { GasResult, Tx, GasLevel } from 'background/service/openapi';
import { Popup } from 'ui/component';
import { formatTokenAmount } from 'ui/utils/number';
import IconSetting from 'ui/assets/setting-gray.svg';
import IconInfo from 'ui/assets/infoicon.svg';

export interface GasSelectorResponse extends GasLevel {
  gasLimit: number;
  nonce: number;
}

interface GasSelectorProps {
  gasLimit: string | undefined;
  gas: GasResult;
  chainId: number;
  tx: Tx;
  onChange(gas: GasSelectorResponse): void;
  onMaxPriorityFeeChange(fee: number): void;
  isReady: boolean;
  recommendGasLimit: number;
  nonce: string;
  disableNonce: boolean;
  noUpdate: boolean;
  gasList: GasLevel[];
  selectedGas: GasLevel | null;
  is1559: boolean;
}

const GasSelector = ({
  gasLimit,
  gas,
  chainId,
  tx,
  onChange,
  onMaxPriorityFeeChange,
  isReady,
  recommendGasLimit,
  nonce,
  disableNonce,
  gasList,
  selectedGas,
  is1559,
}: GasSelectorProps) => {
  const { t } = useTranslation();
  const customerInputRef = useRef<Input>(null);
  const [afterGasLimit, setGasLimit] = useState<string | number>(
    Number(gasLimit)
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [customGas, setCustomGas] = useState<string | number>(
    Number(tx.gasPrice || tx.maxFeePerGas || 0) / 1e9
  );
  const [maxPriorityFee, setMaxPriorityFee] = useState<number>(
    selectedGas ? selectedGas.price / 1e9 : 0
  );
  const [customNonce, setCustomNonce] = useState(Number(nonce));
  const [isFirstTimeLoad, setIsFirstTimeLoad] = useState(true);
  const [validateStatus, setValidateStatus] = useState<
    Record<string, { status: ValidateStatus; message: string | null }>
  >({
    customGas: {
      status: 'success',
      message: null,
    },
    gasLimit: {
      status: 'success',
      message: null,
    },
  });
  const chain = Object.values(CHAINS).find((item) => item.id === chainId)!;

  const handleSetRecommendTimes = () => {
    const value = new BigNumber(recommendGasLimit).times(1.5).toFixed(0);
    setGasLimit(value);
  };

  const formValidator = () => {
    if (!afterGasLimit) {
      setValidateStatus({
        ...validateStatus,
        gasLimit: {
          status: 'error',
          message: t('GasLimitEmptyAlert'),
        },
      });
    } else if (Number(afterGasLimit) < MINIMUM_GAS_LIMIT) {
      setValidateStatus({
        ...validateStatus,
        gasLimit: {
          status: 'error',
          message: t('GasLimitMinimumValueAlert'),
        },
      });
    } else {
      setValidateStatus({
        ...validateStatus,
        gasLimit: {
          status: 'success',
          message: null,
        },
      });
    }
  };

  const handleShowSelectModal = () => {
    setModalVisible(true);
  };

  const handleConfirmGas = () => {
    if (!selectedGas) return;
    if (selectedGas.level === 'custom') {
      onChange({
        ...selectedGas,
        price: Number(customGas) * 1e9,
        gasLimit: Number(afterGasLimit),
        nonce: Number(customNonce),
        level: selectedGas.level,
      });
    } else {
      onChange({
        ...selectedGas,
        gasLimit: Number(afterGasLimit),
        nonce: Number(customNonce),
        level: selectedGas.level,
      });
    }
  };

  const handleModalConfirmGas = () => {
    handleConfirmGas();
    setModalVisible(false);
  };

  const handleCustomGasChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (/^\d*(\.\d*)?$/.test(e.target.value)) {
      setCustomGas(e.target.value);
    }
  };

  const handleGasLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (/^\d*$/.test(e.target.value)) {
      setGasLimit(e.target.value);
    }
  };

  const handleCustomNonceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (/^\d*$/.test(e.target.value)) {
      setCustomNonce(Number(e.target.value));
    }
  };

  const panelSelection = (e, gas: GasLevel) => {
    e.stopPropagation();
    let target = gas;

    if (gas.level === selectedGas?.level) return;

    if (gas.level === 'custom') {
      if (selectedGas && selectedGas.level !== 'custom' && !gas.price) {
        target =
          gasList.find((item) => item.level === selectedGas.level) || gas;
      }
      setCustomGas(Number(target.price) / 1e9);
      onChange({
        ...target,
        gasLimit: Number(afterGasLimit),
        nonce: Number(customNonce || nonce),
        level: 'custom',
      });
      customerInputRef.current?.focus();
    } else {
      onChange({
        ...gas,
        gasLimit: Number(afterGasLimit),
        nonce: Number(customNonce || nonce),
        level: gas?.level,
      });
    }
  };

  const customGasConfirm = (e) => {
    const gas = {
      level: 'custom',
      price: Number(e?.target?.value),
      front_tx_count: 0,
      estimated_seconds: 0,
      base_fee: gasList[0].base_fee,
    };
    onChange({
      ...gas,
      price: Number(gas.price),
      gasLimit: Number(afterGasLimit),
      nonce: Number(customNonce || nonce),
      level: gas.level,
    });
  };

  const handleMaxPriorityFeeChange = (val: number) => {
    setMaxPriorityFee(val);
  };

  useDebounce(
    () => {
      (isReady || !isFirstTimeLoad) && handleConfirmGas();
    },
    500,
    [customGas]
  );

  useEffect(() => {
    setGasLimit(Number(gasLimit));
  }, [gasLimit]);

  useEffect(() => {
    formValidator();
  }, [afterGasLimit, selectedGas, gasList]);

  useEffect(() => {
    if (!selectedGas) return;
    setMaxPriorityFee(selectedGas.price / 1e9);
    if (selectedGas?.level !== 'custom') return;
    setCustomGas(selectedGas.price / 1e9);
  }, [selectedGas]);

  useEffect(() => {
    setCustomNonce(Number(nonce));
  }, [nonce]);

  useEffect(() => {
    if (isReady && isFirstTimeLoad) {
      setIsFirstTimeLoad(false);
    }
  }, [isReady]);

  useEffect(() => {
    onMaxPriorityFeeChange(maxPriorityFee * 1e9);
  }, [maxPriorityFee]);

  if (!isReady && isFirstTimeLoad)
    return (
      <>
        <p className="section-title">{t('gasCostTitle')}</p>
        <div className="gas-selector gray-section-block">
          <div className="gas-info mb-12">
            <Skeleton.Input active style={{ width: 200 }} />
          </div>
          <div className="flex mt-15">
            <Skeleton.Button
              active
              style={{ width: 72, height: 48, marginRight: 4 }}
            />
            <Skeleton.Button
              active
              style={{ width: 72, height: 48, marginLeft: 4, marginRight: 4 }}
            />
            <Skeleton.Button
              active
              style={{ width: 72, height: 48, marginLeft: 4, marginRight: 4 }}
            />
            <Skeleton.Button
              active
              style={{ width: 72, height: 48, marginLeft: 4 }}
            />
          </div>
        </div>
      </>
    );
  return (
    <>
      <p className="section-title">{t('gasCostTitle')}</p>
      <div className="gas-selector gray-section-block">
        <div className="top">
          <p className="usmoney">
            ≈ ${gas.estimated_gas_cost_usd_value.toFixed(2)}
          </p>
          <p className="gasmoney">
            {`${formatTokenAmount(gas.estimated_gas_cost_value)} ${
              chain.nativeTokenSymbol
            }`}
          </p>
          <div className="right">
            <img
              src={IconSetting}
              alt="setting"
              className="icon icon-setting"
              onClick={handleShowSelectModal}
            />
          </div>
        </div>
        <div className="card-container">
          {gasList.map((item) => (
            <div
              className={clsx('card cursor-pointer', {
                active: selectedGas?.level === item.level,
              })}
              onClick={(e) => panelSelection(e, item)}
            >
              <div className="gas-level">{t(GAS_LEVEL_TEXT[item.level])}</div>
              <div
                className={clsx('cardTitle', {
                  'custom-input': item.level === 'custom',
                  active: selectedGas?.level === item.level,
                })}
              >
                {item.level === 'custom' ? (
                  <Input
                    className="cursor-pointer"
                    value={customGas}
                    defaultValue={customGas}
                    onChange={handleCustomGasChange}
                    onClick={(e) => panelSelection(e, item)}
                    onPressEnter={customGasConfirm}
                    ref={customerInputRef}
                    autoFocus={selectedGas?.level === item.level}
                    min={0}
                    bordered={false}
                  />
                ) : (
                  item.price / 1e9
                )}
              </div>
            </div>
          ))}
        </div>
        {is1559 && (
          <div className="priority-slider">
            <p className="priority-slider__tip">
              Max Priority Fee: <span>{maxPriorityFee} Gwei</span>
              <Tooltip
                title="This chain supports EIP 1559. Setting the Max Priority Fee properly can save gas costs."
                overlayClassName="rectangle"
              >
                <img src={IconInfo} className="icon icon-info" />
              </Tooltip>
            </p>
            <Slider
              min={0}
              max={selectedGas ? selectedGas.price / 1e9 : 0}
              onChange={handleMaxPriorityFeeChange}
              value={maxPriorityFee}
              step={1}
            />
            <p className="priority-slider__mark">
              <span>0</span>
              <span>{selectedGas ? selectedGas.price / 1e9 : 0}</span>
            </p>
          </div>
        )}
      </div>
      <Popup
        height={460}
        visible={modalVisible}
        title={t('Advanced Options')}
        className="gas-modal"
        onCancel={() => setModalVisible(false)}
        destroyOnClose
        closable
      >
        <Form onFinish={handleConfirmGas}>
          <div className="gas-limit">
            <p className="section-title flex">
              <span className="flex-1">{t('GasLimit')}</span>
            </p>
            <div className="expanded gas-limit-panel-wrapper">
              <Form.Item
                className="gas-limit-panel mb-0"
                validateStatus={validateStatus.gasLimit.status}
              >
                <Input
                  className="popup-input"
                  value={afterGasLimit}
                  onChange={handleGasLimitChange}
                />
              </Form.Item>
              {validateStatus.gasLimit.message ? (
                <p className="tip text-red-light not-italic">
                  {validateStatus.gasLimit.message}
                </p>
              ) : (
                <p className="tip">
                  <Trans
                    i18nKey="RecommendGasLimitTip"
                    values={{
                      est: Number(recommendGasLimit),
                      current: new BigNumber(
                        Number(afterGasLimit) / recommendGasLimit
                      ).toFixed(1),
                    }}
                  />
                  <span
                    className="recommend-times"
                    onClick={handleSetRecommendTimes}
                  >
                    1.5x
                  </span>
                  .
                </p>
              )}
              <div className={clsx({ 'opacity-50': disableNonce })}>
                <p className="section-title mt-20">{t('Nonce')}</p>
                <Form.Item className="gas-limit-panel mb-0" required>
                  <Input
                    className="popup-input"
                    value={customNonce}
                    onChange={handleCustomNonceChange}
                    disabled={disableNonce}
                  />
                </Form.Item>
                <p className="tip">{t('Modify only when necessary')}</p>
              </div>
            </div>
          </div>
          <div className="flex justify-center mt-32 popup-footer">
            <Button
              type="primary"
              className="w-[200px]"
              size="large"
              onClick={handleModalConfirmGas}
              disabled={
                !isReady ||
                validateStatus.customGas.status === 'error' ||
                validateStatus.gasLimit.status === 'error'
              }
            >
              {t('Confirm')}
            </Button>
          </div>
        </Form>
      </Popup>
    </>
  );
};

export default GasSelector;
