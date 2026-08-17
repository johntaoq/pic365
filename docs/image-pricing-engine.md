# Pic365 生图计费引擎

每条生图服务配置独立保存模型、密钥和计费规则。报价接口、积分预扣、成功扣费及失败退款必须使用同一条规则。

## 通用字段

- `strategy`：计费方式。
- `priceStepRmb`：价格阶梯，GPT-Image-2 当前为 `0.1` 元。
- `minimumChargeRmb`、`maximumChargeRmb`：单张价格边界。
- `autoSizePixels`、`autoQuality`：Auto 参数的计费基准。
- `promotionEligible`：是否参加全站促销。

## 支持的计费方式

1. `pixel-quality-formula`：基础成本 + 每百万像素成本，再乘质量倍率。适合 GPT-Image-2。
2. `fixed-quality`：Low、Medium、High 分别设置固定单价。适合只按质量收费的服务。
3. `fixed-image`：所有尺寸和质量使用同一单价。
4. `pixel-quality-matrix`：为多个像素上限分别配置 Low、Medium、High 单价。

## GPT-Image-2 默认规则

使用用户提供的折扣前成本曲线：

```text
折扣前成本 = 质量倍率 ×（0.0271183377 + 0.0134377300 × 百万像素）
```

质量倍率：Low `1`、Medium `9`、High `36`。客户原价按实际像素连续计算，向上取整到 `0.1` 元；最低 `0.2` 元，最高 `5.0` 元。实际采购成本比例为 `0.3`，只用于内部成本记录，不参与客户原价计算。

促销在原价计算完成后执行：

```text
折后积分 = 四舍五入（原价积分 × 实付比例）
```

促销后的最低收费仍受该服务的最低收费限制。
