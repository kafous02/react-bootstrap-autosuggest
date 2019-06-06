// @flow

import classNames from 'classnames'
import shallowEqual from 'fbjs/lib/shallowEqual'
import keycode from 'keycode'
import React from 'react'
import { Dropdown } from 'react-bootstrap'
import ReactDOM from 'react-dom'
import warning from 'warning'

import Choices from './Choices'
import Suggestions from './Suggestions'
import ItemAdapter from './ItemAdapter'
export { ItemAdapter }
import ListAdapter from './ListAdapter'
export { ListAdapter }
import EmptyListAdapter from './EmptyListAdapter'
export { EmptyListAdapter }
import ArrayListAdapter from './ArrayListAdapter'
export { ArrayListAdapter }
import MapListAdapter from './MapListAdapter'
export { MapListAdapter }
import ObjectListAdapter from './ObjectListAdapter'
export { ObjectListAdapter }
import type { Node } from './types'

type Props = {
  addonAfter?: Node;
  addonBefore?: Node;
  allowDuplicates?: boolean;
  bsSize?: 'small' | 'large';
  buttonAfter?: Node;
  buttonBefore?: Node;
  choicesClass?: React.Component<*, *, *> | string;
  closeOnCompletion?: boolean;
  datalist?: any;
  datalistAdapter?: ListAdapter<*, *>;
  datalistMessage?: Node;
  datalistOnly?: boolean;
  datalistPartial?: boolean;
  defaultValue?: any;
  disabled?: boolean;
  dropup?: boolean;
  groupClassName?: string;
  inputSelect?: (input: HTMLInputElement, value: string, completion: string) => void;
  itemAdapter?: ItemAdapter<*>;
  itemReactKeyPropName?: string;
  itemSortKeyPropName?: string;
  itemValuePropName?: string;
  multiple?: boolean;
  onAdd?: (item: any) => void;
  onBlur?: (value: any) => void;
  onChange?: (value: any) => void;
  onDatalistMessageSelect?: () => void;
  onFocus?: (value: any) => void;
  onRemove?: (index: number) => void;
  onSearch?: (search: string) => void;
  onSelect?: (item: any) => void;
  onToggle?: (open: boolean) => void;
  placeholder?: string;
  required?: boolean;
  searchDebounce?: number;
  showToggle?: boolean | 'auto';
  suggestionsClass?: React.Component<*, *, *> | string;
  toggleId?: string | number;
  type?: string;
  value?: any;
  valueIsItem?: boolean;
}

type State = {
  open: boolean;
  disableFilter: boolean;
  inputValue: string;
  inputValueKeyPress: number;
  inputFocused: boolean;
  selectedItems: any[];
  searchValue: ?string;
}

/**
 * Combo-box input component that combines a drop-down list and a single-line
 * editable text box. The set of options for the drop-down list can be
 * controlled dynamically. Selection of multiple items is supported using a
 * tag/pill-style user interface within a simulated text box.
 */
export default class Autosuggest extends React.Component {
  static defaultInputSelect(input: HTMLInputElement, value: string, completion: string) {
    // https://html.spec.whatwg.org/multipage/forms.html#do-not-apply
    switch (input.type) {
    case 'text':
    case 'search':
    case 'url':
    case 'tel':
    case 'password':
    case 'textarea':
      // istanbul ignore else
      if (input.setSelectionRange) {
        input.setSelectionRange(value.length, completion.length)
      } else if (input.createTextRange) { // old IE
        const range = input.createTextRange()
        range.moveEnd('character', completion.length)
        range.moveStart('character', value.length)
        range.select()
      }
    }
  }

  static defaultProps = {
    closeOnCompletion: false,
    datalistOnly: false,
    datalistPartial: false,
    disabled: false,
    dropup: false,
    inputSelect: Autosuggest.defaultInputSelect,
    multiple: false,
    itemReactKeyPropName: 'key',
    itemSortKeyPropName: 'sortKey',
    itemValuePropName: 'value',
    searchDebounce: 250,
    showToggle: 'auto',
    type: 'text',
    valueIsItem: false
  };

  state: State;

  _itemAdapter: ItemAdapter<*>;
  _listAdapter: ListAdapter<*, *>;
  _lastValidItem: any;
  _lastValidValue: string;
  _foldedInputValue: string;
  _pseudofocusedItem: any;
  _keyPressCount: number;
  _inputItem: any;
  _inputItemEphemeral: boolean;
  _valueIsValid : boolean;
  _valueWasValidated: boolean;
  _lastOnChangeValue: any;
  _lastOnSelectValue: any;
  _autoCompleteAfterRender: ?boolean;
  _menuFocusedBeforeUpdate: ?boolean;
  _lastOpenEventType: ?string;
  _focusTimeoutId: ?number;
  _focused: ?boolean;
  _searchTimeoutId: ?number;

  constructor(props: Props, ...args: any) {
    super(props, ...args)
    /* istanbul ignore next: https://github.com/gotwarlost/istanbul/issues/690#issuecomment-265718617 */
    this._itemAdapter = props.itemAdapter || new ItemAdapter()
    this._itemAdapter.receiveProps(props)

    this._listAdapter = props.datalistAdapter ||
      this._getListAdapter(props.datalist)
    this._listAdapter.receiveProps(props, this._itemAdapter)

    const { inputValue, inputItem, inputItemEphemeral, selectedItems } =
      this._getValueFromProps(props)
    this._setValueMeta(inputItem, inputItemEphemeral, true, true)
    this._lastValidItem = inputItem
    this._lastValidValue = inputValue
    this._keyPressCount = 0

    this.state = {
      open: false,
      disableFilter: false,
      inputValue,
      inputValueKeyPress: 0,
      inputFocused: false,
      selectedItems,
      searchValue: null
    }
    this._lastOnChangeValue = this._getCurrentValue()
    this._lastOnSelectValue = inputItem

    const self: any = this // https://github.com/facebook/flow/issues/1517
    self._renderSelected = this._renderSelected.bind(this)
    self._getItemKey = this._getItemKey.bind(this)
    self._isSelectedItem = this._isSelectedItem.bind(this)
    self._renderSuggested = this._renderSuggested.bind(this)
    self._handleToggleClick = this._handleToggleClick.bind(this)
    self._handleInputChange = this._handleInputChange.bind(this)
    self._handleItemSelect = this._handleItemSelect.bind(this)
    self._removeItem = this._removeItem.bind(this)
    self._handleShowAll = this._handleShowAll.bind(this)
    self._handleKeyDown = this._handleKeyDown.bind(this)
    self._handleKeyPress = this._handleKeyPress.bind(this)
    self._handleMenuClose = this._handleMenuClose.bind(this)
    self._handleInputFocus = this._handleInputFocus.bind(this)
    self._handleInputBlur = this._handleInputBlur.bind(this)
    self._handleFocus = this._handleFocus.bind(this)
    self._handleBlur = this._handleBlur.bind(this)
  }

  _getListAdapter<L>(list: L): ListAdapter<*, L> {
    if (list == null) {
      return (new EmptyListAdapter(): any)
    } else if (Array.isArray(list)) {
      return (new ArrayListAdapter(): any)
    } else if (list instanceof Map) {
      return (new MapListAdapter(): any)
    } else if (typeof list === 'object') {
      return (new ObjectListAdapter(): any)
    } else {
      throw Error('Unexpected datalist type: datalistAdapter required')
    }
  }

  _getValueFromProps(props: Props): {
      inputValue: string,
      inputItem: any,
      inputItemEphemeral: boolean,
      selectedItems: any[]
    } {
    let inputValue = ''
    let inputItem = null
    let inputItemEphemeral = false
    let selectedItems = []
    const value = props.value || props.defaultValue
    if (value != null) {
      if (props.multiple) {
        if (Array.isArray(value)) {
          selectedItems = this._filterItems(value, props)
        } else {
          warning(!value, 'Array expected for value property')
        }
      } else if (props.valueIsItem) {
        const itemValue = this._itemAdapter.getInputValue(value)
        if (props.datalist != null) {
          inputItem = this._listAdapter.findMatching(props.datalist, itemValue)
          if (inputItem != null) {
            inputValue = inputItem === value ? itemValue :
              this._itemAdapter.getInputValue(inputItem)
          } else if (props.datalistOnly && !props.datalistPartial) {
            this._warnInvalidValue(value)
          } else {
            inputValue = itemValue
            inputItem = value
          }
        } else {
          inputValue = itemValue
          inputItem = value
        }
      } else if (value) {
        if (props.datalist != null) {
          inputItem = this._listAdapter.findMatching(props.datalist, value)
          if (inputItem != null) {
            inputValue = this._itemAdapter.getInputValue(inputItem)
          } else if (props.datalistOnly && !props.datalistPartial) {
            this._warnInvalidValue(value)
          } else {
            inputValue = value.toString()
            inputItem = this._itemAdapter.newFromValue(value)
            inputItemEphemeral = true
          }
        } else {
          inputValue = value.toString()
          inputItem = this._itemAdapter.newFromValue(value)
          inputItemEphemeral = true
        }
      }
    }
    return { inputValue, inputItem, inputItemEphemeral, selectedItems }
  }

  _filterItems(items: any[], props: Props): any[] {
    if (props.datalist != null || !props.allowDuplicates) {
      const result = []
      const valueSet = {}
      let different = false
      for (let item of items) {
        const value = this._itemAdapter.getInputValue(item)
        if (!props.allowDuplicates && valueSet[value]) {
          different = true
          continue
        }
        const listItem =  this._listAdapter.findMatching(props.datalist, value)
        if (listItem != null) {
          result.push(listItem)
          valueSet[value] = true
          different = true
        } else if (props.datalistOnly && !props.datalistPartial) {
          this._warnInvalidValue(value)
          different = true
        } else {
          result.push(item)
          valueSet[value] = true
        }
      }
      if (different) {
        return result
      }
    }
    return items
  }

  _warnInvalidValue(value: string) {
    warning(false, 'Value "%s" does not match any datalist value', value)
  }

  _setInputValue(value: string, callback?: () => void) {
    // track keypress count in state so re-render is forced even if value is
    // unchanged; this is necessary when typing over the autocompleted range
    // with matching characters to properly maintain the input selection range
    this.setState({
      inputValue: value,
      inputValueKeyPress: this._keyPressCount
    }, callback)
  }

  _setValueMeta(
      inputItem: any,
      inputItemEphemeral: boolean = false,
      isValid: boolean = inputItem != null,
      validated: boolean = isValid) {
    this._inputItem = inputItem
    this._inputItemEphemeral = inputItemEphemeral
    this._valueIsValid = isValid
    this._valueWasValidated = validated
  }

  _clearInput() {
    this._setValueMeta(null, false, true, true)
    this._setInputValue('')
  }

  _getValueUsing(props: Props, inputValue: string, inputItem: any, selectedItems: any[]) {
    return props.multiple ? selectedItems :
      props.valueIsItem ? inputItem : inputValue
  }

  _getCurrentValue() {
    return this._getValueUsing(
      this.props, this.state.inputValue, this._inputItem, this.state.selectedItems)
  }

  componentDidMount() {
    // IE8 can jump cursor position if not immediately updated to typed value;
    // for other browsers, we can avoid re-rendering for the auto-complete
    this._autoCompleteAfterRender = !this.refs.input.setSelectionRange
  }

  componentWillReceiveProps(nextProps: Props) {
    if (nextProps.itemAdapter != this.props.itemAdapter) {
      this._itemAdapter = nextProps.itemAdapter || new ItemAdapter()
    }
    this._itemAdapter.receiveProps(nextProps)

    if (nextProps.datalist != this.props.datalist ||
        nextProps.datalistAdapter != this.props.datalistAdapter) {
      if (nextProps.datalistAdapter) {
        this._listAdapter = nextProps.datalistAdapter
      } else {
        const listAdapter = this._getListAdapter(nextProps.datalist)
        if (listAdapter.constructor != this._listAdapter.constructor) {
          this._listAdapter = listAdapter
        }
      }
    }
    this._listAdapter.receiveProps(nextProps, this._itemAdapter)

    // if props.value changes (to a value other than the current state), or
    // validation changes to make state invalid, propagate props.value to state
    const nextValue = nextProps.value
    let { inputValue } = this.state
    const valueChanged = nextValue !== this.props.value &&
      nextValue !== this._getValueUsing(nextProps, inputValue, this._inputItem,
        this.state.selectedItems)
    let inputItem, inputValueInvalid, propsValueInvalid, validateSelected
    if (!valueChanged) {
      if (nextProps.datalistOnly) {
        const canValidate = !nextProps.datalistPartial && nextProps.datalist != null
        const validationChanged = !this.props.datalistOnly ||
          (!nextProps.datalistPartial && this.props.datalistPartial) ||
          (nextProps.datalist != this.props.datalist)
        if (inputValue) {
          inputItem = this._listAdapter.findMatching(nextProps.datalist, inputValue)
          if (inputItem == null) {
            if (!canValidate && !this._inputItemEphemeral) {
              inputItem = this._inputItem
            } else if (this._inputItemEphemeral && nextValue === inputValue) {
              propsValueInvalid = true
            }
          }
          inputValueInvalid = inputItem == null && validationChanged
          // update metadata but don't reset input value if invalid but focused
          if (inputValueInvalid && this._focused) {
            this._setValueMeta(null, false, false, true)
            if (validationChanged && canValidate && this._lastValidItem != null) {
              // revalidate last valid item, which will be restored on blur
              this._lastValidItem = this._listAdapter.findMatching(
                nextProps.datalist, this._lastValidValue)
              if (this._lastValidItem == null) {
                this._lastValidValue = ''
              }
            }
            inputValueInvalid = false
          }
        } else {
          inputItem = null
          inputValueInvalid = false
        }
        validateSelected = nextProps.multiple && canValidate && validationChanged
      }
      if (nextProps.multiple && !nextProps.allowDuplicates && this.props.allowDuplicates) {
        validateSelected = true
      }
    }
    // inputValueInvalid implies !multiple, since inputValue of multiple should
    // be blank when not focused
    if (valueChanged || inputValueInvalid) {
      let inputItemEphemeral, selectedItems
      if (propsValueInvalid) {
        inputValue = ''
        inputItemEphemeral = false
        selectedItems = []
      } else {
        ({ inputValue, inputItem, inputItemEphemeral, selectedItems } =
          this._getValueFromProps(nextProps))
      }
      // if props.value change resolved to current state item, don't reset input
      if (inputItem !== this._inputItem || !this._focused) {
        this._setValueMeta(inputItem, inputItemEphemeral, true, true)
        this._setInputValue(inputValue)
        this.setState({ selectedItems })
        validateSelected = false
        this._lastValidItem = inputItem
        this._lastValidValue = inputValue
        // suppress onChange (but not onSelect) if value came from props
        if (valueChanged) {
          this._lastOnChangeValue = this._getValueUsing(nextProps, inputValue,
            inputItem, selectedItems)
        }
      } else if (valueChanged && nextProps.multiple) {
        this.setState({ selectedItems })
      }
    } else if (inputValue && nextProps.datalist != this.props.datalist && this._focused) {
      // if datalist changed but value didn't, attempt to autocomplete
      this._checkAutoComplete(inputValue, nextProps)
    }
    if (validateSelected) {
      const selectedItems = this._filterItems(this.state.selectedItems, nextProps)
      this.setState({ selectedItems })
    }

    // open dropdown if datalist message is set while focused
    if (nextProps.datalistMessage &&
        nextProps.datalistMessage != this.props.datalistMessage &&
        this._focused) {
      this._open('message', nextProps)
    }
  }

  shouldComponentUpdate(nextProps: Props, nextState: State): boolean {
    return !shallowEqual(this.props, nextProps) || !shallowEqual(this.state, nextState)
  }

  componentWillUpdate(nextProps: Props, nextState: State) {
    const { suggestions } = this.refs
    this._menuFocusedBeforeUpdate = suggestions && suggestions.isFocused()

    const nextInputValue = nextState.inputValue
    if (nextInputValue != this.state.inputValue) {
      let inputItem, inputItemEphemeral, isValid
      if (!this._valueWasValidated) {
        if (nextInputValue) {
          inputItem = this._listAdapter.findMatching(nextProps.datalist, nextInputValue)
          if (inputItem == null && !nextProps.datalistOnly) {
            inputItem = this._itemAdapter.newFromValue(nextInputValue)
            inputItemEphemeral = true
            isValid = true
          } else {
            inputItemEphemeral = false
            isValid = inputItem != null
          }
        } else {
          inputItem = null
          inputItemEphemeral = false
          isValid = !nextProps.required
        }
        this._setValueMeta(inputItem, inputItemEphemeral, isValid)
      } else {
        inputItem = this._inputItem
        isValid = this._valueIsValid
      }
      if (isValid) {
        this._lastValidItem = inputItem
        this._lastValidValue = inputItem && !inputItemEphemeral ?
          this._itemAdapter.getInputValue(inputItem) : nextInputValue
      }

      if (isValid) {
        const { multiple, onChange } = nextProps
        if (!multiple && onChange) {
          const value = this._getValueUsing(
            nextProps, nextInputValue, inputItem, nextState.selectedItems)
          if (value !== this._lastOnChangeValue) {
            this._lastOnChangeValue = value
            onChange(value)
          }
        }

        const { onSelect } = nextProps
        if (onSelect && inputItem !== this._lastOnSelectValue) {
          this._lastOnSelectValue = inputItem
          onSelect(inputItem)
        }
      }
    }

    const { onToggle } = nextProps
    if (onToggle && nextState.open != this.state.open) {
      onToggle(nextState.open)
    }
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    if ((this.state.open && !prevState.open &&
          this._lastOpenEventType === 'keydown') ||
        (this.state.disableFilter && !prevState.disableFilter &&
          this._menuFocusedBeforeUpdate)) {
      this.refs.suggestions.focusFirst()
    } else if (!this.state.open && prevState.open) { // closed
      if (this._menuFocusedBeforeUpdate) {
        this._menuFocusedBeforeUpdate = false
        this._focusInput()
      }
    }
  }

  componentWillUnmount() {
    clearTimeout(this._focusTimeoutId)
    this._focusTimeoutId = null
    clearTimeout(this._searchTimeoutId)
    this._searchTimeoutId = null
  }

  _focusInput() {
    const input = ReactDOM.findDOMNode(this.refs.input)
    // istanbul ignore else
    if (input instanceof HTMLElement) {
      input.focus()
    }
  }

  _open(eventType: string, props: Props) {
    this._lastOpenEventType = eventType
    const disableFilter = eventType !== 'autocomplete' && this._hasNoOrExactMatch(props)
    this.setState({ open: true, disableFilter })

    const { onSearch } = props
    const { inputValue, searchValue } = this.state
    if (onSearch && searchValue !== inputValue) {
      this.setState({ searchValue: inputValue })
      onSearch(inputValue)
    }
  }

  _close() {
    this.setState({ open: false })
  }

  _toggleOpen(eventType: string, props: Props) {
    if (this.state.open) {
      this._close()
    } else {
      this._open(eventType, props)
    }
  }

  _canOpen(): boolean {
    const { datalist } = this.props
    return (datalist == null && this.props.onSearch) ||
      !this._listAdapter.isEmpty(datalist) ||
      !!this.props.datalistMessage
  }

  _hasNoOrExactMatch(props: Props): boolean {
    if (this._inputItem != null && !this._inputItemEphemeral) {
      return true // exact match
    }
    const foldedValue = this._itemAdapter.foldValue(this.state.inputValue)
    return this._listAdapter.find(props.datalist,
        item => this._itemAdapter.itemIncludedByInput(item, foldedValue)) == null
  }

  render(): React.Element<*> {
    const { showToggle } = this.props
    const toggleCanOpen = this._canOpen()
    const toggleVisible = showToggle === 'auto' ? toggleCanOpen : showToggle
    const classes = {
      autosuggest: true,
      open: this.state.open,
      disabled: this.props.disabled,
      dropdown: toggleVisible && !this.props.dropup,
      dropup: toggleVisible && this.props.dropup
    }
    return <div
        key="dropdown"
        className={classNames(classes)}
        onFocus={this._handleFocus}
        onBlur={this._handleBlur}>
      {this._renderInputGroup(toggleVisible, toggleCanOpen)}
      {this._renderMenu()}
    </div>
  }

  _renderInputGroup(toggleVisible: boolean, toggleCanOpen: boolean): Node {
    const addonBefore = this.props.addonBefore ? (
      <span className="input-group-addon" key="addonBefore">
        {this.props.addonBefore}
      </span>
    ) : null

    const addonAfter = this.props.addonAfter ? (
      <span className="input-group-addon" key="addonAfter">
        {this.props.addonAfter}
      </span>
    ) : null

    const buttonBefore = this.props.buttonBefore ? (
      <span className="input-group-btn">
        {this.props.buttonBefore}
      </span>
    ) : null

    // Bootstrap expects the dropdown toggle to be last,
    // as it does not reset the right border radius for toggles:
    // .input-group-btn:last-child > .btn:not(:last-child):not(.dropdown-toggle)
    // { @include border-right-radius(0); }
    const toggle = toggleVisible && this._renderToggle(toggleCanOpen)
    const buttonAfter = (toggle || this.props.buttonAfter) ? (
      <span className="input-group-btn">
        {this.props.buttonAfter}
        {toggle}
      </span>
    ) : null

    const classes = classNames({
      'input-group': addonBefore || addonAfter || buttonBefore || buttonAfter,
      'input-group-sm': this.props.bsSize === 'small',
      'input-group-lg': this.props.bsSize === 'large',
      'input-group-toggle': !!toggle
    })
    return classes ? (
      <div className={classes} key="input-group">
        {addonBefore}
        {buttonBefore}
        {this._renderChoices()}
        {addonAfter}
        {buttonAfter}
      </div>
    ) : this._renderChoices()
  }

  _renderToggle(canOpen: boolean): Node {
    return (
      <Dropdown.Toggle
        ref="toggle"
        key="toggle"
        id={this.props.toggleId}
        bsSize={this.props.bsSize}
        disabled={this.props.disabled || !canOpen}
        open={this.state.open}
        onClick={this._handleToggleClick}
        onKeyDown={this._handleKeyDown} />
    )
  }

  _renderChoices(): Node {
    if (this.props.multiple) {
      const { choicesClass: ChoicesClass = Choices } = this.props
      return (
        <ChoicesClass ref="choices"
            autoHeight={!this.props.showToggle &&
              !this.props.addonAfter && !this.props.addonBefore &&
              !this.props.buttonAfter && !this.props.buttonBefore}
            disabled={this.props.disabled}
            focused={this.state.inputFocused}
            inputValue={this.state.inputValue}
            items={this.state.selectedItems}
            onKeyPress={this._handleKeyPress}
            onRemove={this._removeItem}
            renderItem={this._renderSelected}>
          {this._renderInput()}
        </ChoicesClass>
      )
    }
    return this._renderInput()
  }

  // autobind
  _renderSelected(item: any): Node {
    return this._itemAdapter.renderSelected(item)
  }

  _renderInput(): Node {
    const formGroup = this.context.$bs_formGroup
    const controlId = formGroup && formGroup.controlId
    const extraProps = {}

    const noneSelected = !this.props.multiple || !this.state.selectedItems.length
    // set autoComplete off to avoid a redundant browser drop-down menu,
    // but allow it to be overridden by extra props for auto-fill purposes

    const _input = this.props.type === 'textarea' ? 'textarea' : 'input'
    return <_input
      autoComplete="off"
      {...extraProps}
      className={classNames(this.props.className,
        { 'form-control': !this.props.multiple })}
      ref="input"
      key="input"
      id={controlId}
      disabled={this.props.disabled}
      required={this.props.required && noneSelected}
      placeholder={noneSelected ? this.props.placeholder : undefined}
      type={this.props.type}
      value={this.state.inputValue}
      onChange={this._handleInputChange}
      onKeyDown={this._handleKeyDown}
      onKeyPress={this._handleKeyPress}
      onFocus={this._handleInputFocus}
      onBlur={this._handleInputBlur} />
  }

  _renderMenu(): ?Node {
    this._pseudofocusedItem = null
    const { open } = this.state
    if (!open) {
      return null
    }
    const { datalist } = this.props
    const foldedValue = this._itemAdapter.foldValue(this.state.inputValue)
    this._foldedInputValue = foldedValue
    let items
    if (this.state.disableFilter) {
      items = this._listAdapter.toArray(datalist)
    } else {
      items = this._listAdapter.filter(datalist, item =>
        this._itemAdapter.itemIncludedByInput(item, foldedValue) &&
          this._allowItem(item))
    }
    items = this._itemAdapter.sortItems(items, foldedValue)
    const filtered = items.length < this._listAdapter.getLength(datalist)
    // visually indicate that first item will be selected if Enter is pressed
    // while the input element is focused (unless multiple and not datalist-only)
    let focusedIndex
    if (items.length > 0 && this.state.inputFocused &&
        (!this.props.multiple || this.props.datalistOnly)) {
      this._pseudofocusedItem = items[focusedIndex = 0]
    }
    const { suggestionsClass: SuggestionsClass = Suggestions,
      datalistMessage, onDatalistMessageSelect, toggleId } = this.props
    return <SuggestionsClass ref="suggestions"
      datalistMessage={datalistMessage}
      filtered={filtered}
      focusedIndex={focusedIndex}
      getItemKey={this._getItemKey}
      isSelectedItem={this._isSelectedItem}
      items={items}
      labelledBy={toggleId}
      onClose={this._handleMenuClose}
      onDatalistMessageSelect={onDatalistMessageSelect}
      onDisableFilter={this._handleShowAll}
      onSelect={this._handleItemSelect}
      open={open}
      renderItem={this._renderSuggested} />
  }

  _allowItem(item: any): boolean {
    if (this.props.allowDuplicates) {
      return true
    }
    const value = this._itemAdapter.getInputValue(item)
    return !this.state.selectedItems.find(
      i => this._itemAdapter.getInputValue(i) === value)
  }

  // autobind
  _getItemKey(item: any): string | number {
    return this._itemAdapter.getReactKey(item)
  }

  // autobind
  _isSelectedItem(item: any): boolean {
    return this._itemAdapter.itemMatchesInput(item, this._foldedInputValue)
  }

  // autobind
  _renderSuggested(item: any): Node {
    return this._itemAdapter.renderSuggested(item)
  }

  // autobind
  _handleToggleClick() {
    this._toggleOpen('click', this.props)
  }

  // autobind
  _handleInputChange(event: SyntheticInputEvent) {
    const { value } = (event.target: Object)
    // prevent auto-complete on backspace/delete/copy/paste/etc.
    const allowAutoComplete = this._keyPressCount > this.state.inputValueKeyPress
    if (allowAutoComplete && value) {
      if (this._autoCompleteAfterRender) {
        this._setValueMeta()
        this._setInputValue(value, () => {
          this._checkAutoComplete(value, this.props)
        })
      } else if (!this._checkAutoComplete(value, this.props)) {
        this._setValueMeta()
        this._setInputValue(value)
      }
    } else {
      this._setValueMeta()
      this._setInputValue(value)
    }

    // suppress onSearch if can't auto-complete and not open
    if (allowAutoComplete || this.state.open) {
      const { onSearch } = this.props
      if (onSearch) {
        clearTimeout(this._searchTimeoutId)
        this._searchTimeoutId = setTimeout(() => {
          this._searchTimeoutId = null
          if (value != this.state.searchValue) {
            this.setState({ searchValue: value })
            onSearch(value)
          }
        }, this.props.searchDebounce)
      }
    }
  }

  _checkAutoComplete(value: string, props: Props) {
    // open dropdown if any items would be included
    let valueUpdated = false
    const { datalist } = props
    const foldedValue = this._itemAdapter.foldValue(value)
    const includedItems = this._listAdapter.filter(datalist, i =>
      this._itemAdapter.itemIncludedByInput(i, foldedValue) && this._allowItem(i))
    if (includedItems.length > 0) {
      // if only one item is included and the value must come from the list,
      // autocomplete using that item
      const { datalistOnly, datalistPartial } = props
      if (includedItems.length === 1 && datalistOnly && !datalistPartial) {
        const found = includedItems[0]
        const foundValue = this._itemAdapter.getInputValue(found)
        let callback
        const { inputSelect } = props
        if (value != foundValue && inputSelect &&
          this._itemAdapter.foldValue(foundValue).startsWith(foldedValue)) {
          const input = this.refs.input
          callback = () => { inputSelect(input, value, foundValue) }
        }
        this._setValueMeta(found)
        this._setInputValue(foundValue, callback)
        valueUpdated = true
        if (this.state.open ? props.closeOnCompletion :
            value != foundValue && !props.closeOnCompletion) {
          this._toggleOpen('autocomplete', props)
        }
      } else {
        // otherwise, just check if any values match, and select the first one
        // (without modifying the input value)
        const found = includedItems.find(i =>
          this._itemAdapter.itemMatchesInput(i, foldedValue))
        if (found) {
          this._setValueMeta(found)
          this._setInputValue(value)
          valueUpdated = true
        }
        // open dropdown unless exactly one matching value was found
        if (!this.state.open && (!found || includedItems.length > 1)) {
          this._open('autocomplete', props)
        }
      }
    }
    return valueUpdated
  }

  // autobind
  _handleItemSelect(item: any) {
    if (this.props.multiple) {
      this._addItem(item)
    } else {
      const itemValue = this._itemAdapter.getInputValue(item)
      this._setValueMeta(item)
      this._setInputValue(itemValue)
    }
    this._close()
  }

  _addItem(item: any) {
    if (this._allowItem(item)) {
      const selectedItems = [
        ...this.state.selectedItems,
        item
      ]
      this.setState({ selectedItems })
      const { onAdd, onChange } = this.props
      if (onAdd) {
        onAdd(item)
      }
      if (onChange) {
        onChange(selectedItems)
      }
    }
    this._clearInput()
    if (this.state.open) {
      this._close()
    }
  }

  // autobind
  _removeItem(index: number) {
    const previousItems = this.state.selectedItems
    const selectedItems = previousItems.slice(0, index).concat(
      previousItems.slice(index + 1))
    this.setState({ selectedItems })
    const { onRemove, onChange } = this.props
    if (onRemove) {
      onRemove(index)
    }
    if (onChange) {
      onChange(selectedItems)
    }
  }

  _addInputValue(): boolean {
    if (this._inputItem) {
      this._addItem(this._inputItem)
      return true
    }
    return false
  }

  // autobind
  _handleShowAll() {
    this.setState({ disableFilter: true })
  }

  // autobind
  _handleKeyDown(event: SyntheticKeyboardEvent) {
    if (this.props.disabled) return

    switch (event.keyCode || event.which) {
    case keycode.codes.down:
    case keycode.codes['page down']:
      if (this.state.open) {
        this.refs.suggestions.focusFirst()
      } else if (this._canOpen()) {
        this._open('keydown', this.props)
      }
      event.preventDefault()
      break
    case keycode.codes.left:
    case keycode.codes.backspace:
      if (this.refs.choices && this.refs.input &&
          this._getCursorPosition(this.refs.input) === 0) {
        this.refs.choices.focusLast()
        event.preventDefault()
      }
      break
    case keycode.codes.right:
      if (this.refs.choices && this.refs.input &&
          this._getCursorPosition(this.refs.input) === this.state.inputValue.length) {
        this.refs.choices.focusFirst()
        event.preventDefault()
      }
      break
    case keycode.codes.enter:
      if (this.props.multiple && this.state.inputValue) {
        event.preventDefault()
        if (this._addInputValue()) {
          break
        }
      }
      if (this.state.open && this.state.inputFocused) {
        event.preventDefault()
        if (this._pseudofocusedItem) {
          this._handleItemSelect(this._pseudofocusedItem)
        } else {
          this._close()
        }
      }
      break
    case keycode.codes.esc:
    case keycode.codes.tab:
      this._handleMenuClose(event)
      break
    }
  }

  _getCursorPosition(input: React.Component<*, *, *>): ?number {
    const inputNode = ReactDOM.findDOMNode(input)
    // istanbul ignore else
    if (inputNode instanceof HTMLInputElement) {
      return inputNode.selectionStart
    }
  }

  // autobind
  _handleKeyPress() {
    ++this._keyPressCount
  }

  // autobind
  _handleMenuClose() {
    if (this.state.open) {
      this._close()
    }
  }

  // autobind
  _handleInputFocus() {
    this.setState({ inputFocused: true })
  }

  // autobind
  _handleInputBlur() {
    this.setState({ inputFocused: false })
  }

  // autobind
  _handleFocus() {
    if (this._focusTimeoutId) {
      clearTimeout(this._focusTimeoutId)
      this._focusTimeoutId = null
    } else {
      this._focused = true
      const { onFocus } = this.props
      if (onFocus) {
        const value = this._getCurrentValue()
        onFocus(value)
      }
    }
  }

  // autobind
  _handleBlur() {
    this._focusTimeoutId = setTimeout(() => {
      this._focusTimeoutId = null
      this._focused = false
      const { inputValue } = this.state
      const { onBlur } = this.props
      if (this.props.multiple) {
        if (inputValue && !this._addInputValue()) {
          this._clearInput()
        }
      } else if (inputValue != this._lastValidValue) {
        // invoke onBlur after state change, rather than immediately
        let callback
        if (onBlur) {
          callback = () => {
            const value = this._getCurrentValue()
            onBlur(value)
          }
        }
        // restore last valid value/item
        this._setValueMeta(this._lastValidItem, false, true, true)
        this._setInputValue(this._lastValidValue, callback)
        return
      }
      if (onBlur) {
        const value = this._getCurrentValue()
        onBlur(value)
      }
    }, 1)
  }
}
