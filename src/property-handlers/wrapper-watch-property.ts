import { WidgetModel, PropertyModel } from '../models/models';
import { WrapperPropertyHandler } from './wrapper-property';
import { PropertyResolver } from '../resolvers/property-resolver';

/**
 * `:watch="streamA, streamB, ..."` rebuilds the wrapped subtree whenever ANY
 * of the listed streams emits — without tying the render condition to the
 * stream values (unlike nested `| behavior` pipes).
 */
export class WrapperWatchPropertyHandler extends WrapperPropertyHandler {
    constructor(propertyResolver: PropertyResolver) {
        super(propertyResolver, [{ handler: ':watch', targetProperty: 'streams' }], 'MultiStreamBuilder', undefined, 9998);
    }

    protected createWrapperWidget(
        widget: WidgetModel,
        targetProperty: string,
        value: string,
        onWrapped: ((wrapper: WidgetModel) => void)[],
    ): { wrapperWidget: WidgetModel, propertyToUpdateAfterBinding: PropertyModel | null } {
        const streams = value
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);

        const wrapperWidget: WidgetModel = {
            controllers: [],
            vars: [],
            formControls: [],
            properties: [
                {
                    dataType: 'object',
                    value: `[${streams.join(', ')}]`,
                    name: 'streams'
                },
                {
                    dataType: 'function',
                    name: 'builder',
                    value: '',
                    extraData: {
                        parameters: [
                            { name: 'context', type: 'BuildContext' },
                            { name: 'values', type: 'List<dynamic>' }
                        ],
                        addReturn: true
                    }
                }
            ],
            type: this.targetWidgetType,
            wrappedWidgets: [widget],
            onResolved: [],
            isCustom: false
        };

        return { wrapperWidget, propertyToUpdateAfterBinding: null };
    }
}
